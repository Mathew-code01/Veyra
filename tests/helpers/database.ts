// Relative path: tests/helpers/database.ts
//
// PURPOSE:
// Shared helper for tests that need a fresh, migrated SQLite database.
//
// Each call creates a temp database file, runs migrations, and returns the
// path. Callers should closeDatabase() and delete the temp file when done.

import { createDatabase, closeDatabase, getDatabase, overrideDatabaseForTesting } from "../../database/client";

import { promises as fs } from "node:fs";

import { tmpdir } from "node:os";

import { join } from "node:path";

export async function createTestDatabase(): Promise<string> {
  const dbPath = join(
    tmpdir(),

    `veyra-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );

  const handle = createDatabase({ filename: dbPath });

  // Make repositories (which resolve through getDatabase()) operate on this
  // fresh, migrated database for the duration of the test.
  overrideDatabaseForTesting(handle);

  return dbPath;
}

export async function destroyTestDatabase(dbPath: string): Promise<void> {
  closeDatabase();

  try {
    await fs.unlink(dbPath);
  } catch {
    // Best-effort cleanup.
  }
}

export function getTestDatabase() {
  return getDatabase();
}
