import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "../../../database/client";
import { profiles } from "../../../database/schema";

const tempDatabases: string[] = [];

afterEach(async () => {
  for (const path of tempDatabases.splice(0)) {
    try {
      const { rm } = await import("node:fs/promises");
      await rm(path, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  }
});

describe("local sqlite database", () => {
  it("initializes schema and persists data across reopen", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "veyra-db-"));
    const databasePath = join(tempDir, "veyra.sqlite");
    tempDatabases.push(tempDir);

    const first = createDatabase({
      filename: databasePath,
      migrationsFolder: join(process.cwd(), "database", "migrations"),
    });

    first.db.insert(profiles).values({
      id: "profile-1",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      headline: "Engineer",
      summary: "",
      location: "London",
      preferences: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();

    first.close();

    const reopened = createDatabase({
      filename: databasePath,
      migrationsFolder: join(process.cwd(), "database", "migrations"),
    });

    const saved = reopened.db.select().from(profiles).all();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.displayName).toBe("Ada Lovelace");

    reopened.close();
  });
});
