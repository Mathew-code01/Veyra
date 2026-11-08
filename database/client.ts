import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
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

  const db = drizzle(sqlite, { schema });

  if (!options.readonly) {
    const migrationsFolder = resolveMigrationsFolder(options.migrationsFolder);

    if (!existsSync(migrationsFolder)) {
      mkdirSync(migrationsFolder, { recursive: true });
    }

    runMigrations(sqlite, migrationsFolder);
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
    healthCheck: () => {
      sqlite.prepare("SELECT 1").get();
      return true;
    },
  };
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

  for (const file of files) {
    const script = readFileSync(resolve(migrationsFolder, file), "utf8");

    if (!script.trim()) {
      continue;
    }

    sqlite.exec(script);
  }
}

export function withTransaction<T>(
  callback: (tx: any) => T,
): T {
  const { db } = getDatabase();
  return db.transaction((tx: any) => callback(tx));
}
