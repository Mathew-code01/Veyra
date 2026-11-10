import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

export interface DatabaseHandle {
  readonly db: any;
  readonly sqlite: any;
  close: () => void;
  healthCheck: () => boolean;
}

export type DatabaseInstance = DatabaseHandle;

export interface DatabaseOptions {
  filename?: string;
  migrationsFolder?: string;
  readonly?: boolean;
}

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function resolveDatabasePath(filename?: string): string {
  const configured =
    filename ?? process.env.VEYRA_DATABASE_PATH ?? resolve(REPO_ROOT, "data", "veyra.db");

  return resolve(configured);
}

function resolveMigrationsFolder(migrationsFolder?: string): string {
  if (migrationsFolder) {
    return resolve(migrationsFolder);
  }

  return resolve(REPO_ROOT, "database", "migrations");
}

export function createDatabase(options: DatabaseOptions = {}): DatabaseHandle {
  const filename = resolveDatabasePath(options.filename);
  mkdirSync(dirname(filename), { recursive: true });

  const sqlite = new Database(filename, {
    readonly: options.readonly ?? false,
    fileMustExist: options.readonly ?? false,
  });

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");

  try {
    if (!options.readonly) {
      const migrationsFolder = resolveMigrationsFolder(options.migrationsFolder);

      if (!existsSync(migrationsFolder)) {
        throw new Error(
          `Database migrations directory does not exist: ${migrationsFolder}`,
        );
      }

      runMigrations(sqlite, migrationsFolder);
    }

    const db = drizzle(sqlite, { schema });

    return {
      db,
      sqlite,
      close: () => sqlite.close(),
      healthCheck: () => {
        sqlite.prepare("SELECT 1").get();
        return true;
      },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

let singleton: ReturnType<typeof createDatabase> | undefined;

export function getDatabase(): DatabaseInstance {
  if (!singleton) singleton = createDatabase();
  return singleton;
}
export function closeDatabase(): void {
  singleton?.close();

  singleton = undefined;
}

/**
 * Override the active database singleton for testing.
 *
 * Each test should use a fresh, migrated database so repositories (which
 * resolve through getDatabase()) operate on isolated data.
 */
export function overrideDatabaseForTesting(handle: DatabaseInstance): void {
  singleton = handle;
}

function runMigrations(sqlite: Database.Database, migrationsFolder: string): void {
  const files = readdirSync(migrationsFolder)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const migrations = files.map((file) => {
    const match = /^(\d+)_.*\.sql$/.exec(file);
    if (!match) {
      throw new Error(
        `Invalid migration filename "${file}"; expected a numeric prefix and description.`,
      );
    }

    return {
      file,
      version: Number(match[1]),
      script: readFileSync(resolve(migrationsFolder, file), "utf8"),
    };
  });

  const seenVersions = new Set<number>();
  for (const migration of migrations) {
    if (seenVersions.has(migration.version)) {
      throw new Error(
        `Duplicate database migration version ${migration.version}.`,
      );
    }
    seenVersions.add(migration.version);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS veyra_schema_migrations (
      migration_id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedMigrations = sqlite
    .prepare(
      "SELECT migration_id AS migrationId, checksum FROM veyra_schema_migrations",
    )
    .all() as Array<{ migrationId: string; checksum: string }>;
  const appliedById = new Map(
    appliedMigrations.map((migration) => [
      migration.migrationId,
      migration.checksum,
    ]),
  );
  const availableIds = new Set(migrations.map((migration) => migration.file));

  for (const migration of appliedMigrations) {
    if (!availableIds.has(migration.migrationId)) {
      throw new Error(
        `Applied migration "${migration.migrationId}" is missing from the migrations directory.`,
      );
    }
  }

  const recordMigration = sqlite.prepare(
    `INSERT INTO veyra_schema_migrations (migration_id, checksum, applied_at)
     VALUES (?, ?, ?)`,
  );

  for (const migration of migrations) {
    if (!migration.script.trim()) {
      throw new Error(`Database migration "${migration.file}" is empty.`);
    }

    const checksum = createHash("sha256")
      .update(migration.script, "utf8")
      .digest("hex");
    const appliedChecksum = appliedById.get(migration.file);

    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== checksum) {
        throw new Error(
          `Applied migration "${migration.file}" has changed; refusing to rerun it.`,
        );
      }
      continue;
    }

    try {
      sqlite.transaction(() => {
        sqlite.exec(migration.script);
        recordMigration.run(
          migration.file,
          checksum,
          new Date().toISOString(),
        );
      })();
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown migration failure.";
      throw new Error(
        `Database migration "${migration.file}" failed and was rolled back: ${reason}`,
        { cause: error },
      );
    }
  }

  const requiredTables = [
    "profiles",
    "documents",
    "sessions",
    "memories",
    "context_vectors",
    "candidate_evidence",
    "provider_credentials",
    "provider_settings",
    "candidate_profiles",
    "candidate_records",
    "memories",
  ];
  const existingTables = new Set(
    (
      sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as Array<{ name: string }>
    ).map((table) => table.name),
  );
  const missingTables = requiredTables.filter(
    (table) => !existingTables.has(table),
  );
  if (missingTables.length > 0) {
    throw new Error(
      `Database migrations did not create required tables: ${missingTables.join(", ")}.`,
    );
  }

  const foreignKeyViolations = sqlite.pragma("foreign_key_check") as unknown[];
  if (foreignKeyViolations.length > 0) {
    throw new Error(
      `Database migration integrity check found ${foreignKeyViolations.length} foreign-key violation(s).`,
    );
  }
}

export function withTransaction<T>(
  callback: (tx: any) => T,
): T {
  const { db } = getDatabase();
  return db.transaction((tx: any) => callback(tx));
}
