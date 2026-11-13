import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../database/client";
import { profiles } from "../../../database/schema";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "veyra-migrations-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("database migrations", () => {
  it("applies the complete migration sequence once on a fresh database", () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, "fresh.db");
    const handle = createDatabase({ filename: databasePath });

    try {
      const migrations = handle.sqlite
        .prepare(
          "SELECT migration_id FROM veyra_schema_migrations ORDER BY migration_id",
        )
        .all()
        .map((row: { migration_id: string }) => row.migration_id);

      expect(migrations).toEqual([
        "0000_initial.sql",
        "0001_memory.sql",
        "0002_candidate_evidence.sql",
        "0003_memory_fts5.sql",
        "0004_provider_credentials.sql",
        "0005_provider_settings.sql",
        "0006_candidate_profiles.sql",
        "0007_memory_candidate_scope.sql",
      ]);
      expect(
        handle.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('profiles', 'documents', 'memories', 'context_vectors', 'candidate_evidence', 'provider_credentials', 'provider_settings', 'candidate_profiles', 'candidate_records') ORDER BY name",
          )
          .all()
          .map((row: { name: string }) => row.name),
      ).toEqual([
        "candidate_evidence",
        "candidate_profiles",
        "candidate_records",
        "context_vectors",
        "documents",
        "memories",
        "profiles",
        "provider_credentials",
        "provider_settings",
      ]);

      expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
      expect(() =>
        handle.sqlite
          .prepare(
            `INSERT INTO documents
              (id, profile_id, name, original_name, storage_path, created_at, updated_at)
             VALUES ('orphan', 'missing-profile', 'x', 'x', 'x', 'now', 'now')`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      handle.close();
    }

    const reopened = createDatabase({ filename: databasePath });
    try {
      expect(
        reopened.sqlite
          .prepare("SELECT COUNT(*) AS count FROM veyra_schema_migrations")
          .get().count,
      ).toBe(8);
      expect(reopened.sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it("initializes a clean database using the packaged migration assets", () => {
    const directory = createTemporaryDirectory();
    const sourceMigrations = join(process.cwd(), "database", "migrations");
    const packagedMigrations = join(
      directory,
      "dist-electron",
      "database",
      "migrations",
    );
    const databasePath = join(directory, "packaged.db");

    cpSync(sourceMigrations, join(directory, "database", "migrations"), {
      recursive: true,
    });
    execFileSync(
      process.execPath,
      [
        join(process.cwd(), "scripts", "copy-database-migrations.js"),
        directory,
      ],
      { cwd: process.cwd(), stdio: "pipe" },
    );

    const handle = createDatabase({
      filename: databasePath,
      migrationsFolder: packagedMigrations,
    });

    try {
      expect(
        handle.sqlite
          .prepare("SELECT COUNT(*) AS count FROM veyra_schema_migrations")
          .get().count,
      ).toBe(8);
      expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
      expect(
        handle.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'candidate_records'",
          )
          .get(),
      ).toBeDefined();
    } finally {
      handle.close();
    }
  });

  it("preserves an existing database while registering legacy migrations", () => {
    const directory = createTemporaryDirectory();
    const databasePath = join(directory, "legacy.db");
    const migrationsFolder = join(process.cwd(), "database", "migrations");
    const legacy = new Database(databasePath);
    legacy.pragma("foreign_keys = ON");
    legacy.exec(
      readFileSync(join(migrationsFolder, "0000_initial.sql"), "utf8"),
    );
    legacy
      .prepare(
        `INSERT INTO profiles
          (id, display_name, preferences, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("existing-profile", "Existing profile", "{}", "2026-01-01", "2026-01-01");
    legacy.close();

    const upgraded = createDatabase({
      filename: databasePath,
      migrationsFolder,
    });

    try {
      const saved = upgraded.db
        .select()
        .from(profiles)
        .where(eq(profiles.id, "existing-profile"))
        .get();
      expect(saved?.displayName).toBe("Existing profile");
      expect(
        upgraded.sqlite
          .prepare("SELECT COUNT(*) AS count FROM veyra_schema_migrations")
          .get().count,
      ).toBe(8);
      expect(upgraded.sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      upgraded.close();
    }
  }, 120_000);

  it("rolls back a failed migration without recording it as applied", () => {
    const directory = createTemporaryDirectory();
    const migrationsFolder = join(directory, "migrations");
    const databasePath = join(directory, "failed.db");
    mkdirSync(migrationsFolder);
    writeFileSync(
      join(migrationsFolder, "0001_failure.sql"),
      "CREATE TABLE should_rollback (id TEXT PRIMARY KEY); INVALID SQL;",
    );

    expect(() =>
      createDatabase({ filename: databasePath, migrationsFolder }),
    ).toThrow(/0001_failure\.sql.*rolled back/);

    const sqlite = new Database(databasePath);
    try {
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'",
          )
          .get(),
      ).toBeUndefined();
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM veyra_schema_migrations")
          .get().count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it("refuses to rerun an applied migration whose contents changed", () => {
    const directory = createTemporaryDirectory();
    const migrationsFolder = join(directory, "migrations");
    const databasePath = join(directory, "changed.db");
    mkdirSync(migrationsFolder);
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0000_initial.sql"),
      join(migrationsFolder, "0000_initial.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0001_memory.sql"),
      join(migrationsFolder, "0001_memory.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0002_candidate_evidence.sql"),
      join(migrationsFolder, "0002_candidate_evidence.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0003_memory_fts5.sql"),
      join(migrationsFolder, "0003_memory_fts5.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0004_provider_credentials.sql"),
      join(migrationsFolder, "0004_provider_credentials.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0005_provider_settings.sql"),
      join(migrationsFolder, "0005_provider_settings.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0006_candidate_profiles.sql"),
      join(migrationsFolder, "0006_candidate_profiles.sql"),
    );
    copyFileSync(
      join(process.cwd(), "database", "migrations", "0007_memory_candidate_scope.sql"),
      join(migrationsFolder, "0007_memory_candidate_scope.sql"),
    );
    const migrationPath = join(migrationsFolder, "0008_example.sql");
    writeFileSync(migrationPath, "CREATE TABLE example (id TEXT PRIMARY KEY);");

    const initial = createDatabase({ filename: databasePath, migrationsFolder });
    initial.close();

    writeFileSync(
      migrationPath,
      "CREATE TABLE example (id TEXT PRIMARY KEY, value TEXT);",
    );

    expect(() =>
      createDatabase({ filename: databasePath, migrationsFolder }),
    ).toThrow(/has changed; refusing to rerun it/);

    const sqlite = new Database(databasePath);
    try {
      expect(
        sqlite
          .prepare("PRAGMA table_info(example)")
          .all()
          .map((column: { name: string }) => column.name),
      ).toEqual(["id"]);
    } finally {
      sqlite.close();
    }
  });
});
