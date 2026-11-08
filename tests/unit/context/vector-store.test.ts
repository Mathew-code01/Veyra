import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { SqliteVectorStore } from "../../../core/context/storage/SqliteVectorStore";

import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

let dbPath: string;

beforeEach(async () => {
  dbPath = await createTestDatabase();
});

afterEach(async () => {
  await destroyTestDatabase(dbPath);
});

const vectorA = [0.5, 0.0, 0.0, 0.0, 0.0];

const vectorB = [0.0, 0.5, 0.0, 0.0, 0.0];

const vectorC = [0.5, 0.5, 0.0, 0.0, 0.0];

function record(overrides: Partial<{
  id: string;

  contextId: string;

  text: string;

  vector: number[];

  sourceType: "document" | "memory" | "conversation";

  sourceId: string;

  metadata: Record<string, unknown>;
}> = {}): any {
  return {
    id: overrides.id ?? "vec-1",

    contextId: overrides.contextId ?? "ctx-1",

    text: overrides.text ?? "sample text",

    vector: overrides.vector ?? vectorA,

    sourceType: overrides.sourceType ?? "document",

    sourceId: overrides.sourceId ?? "src-1",

    sourceName: "sample.pdf",

    contentType: "text",

    scope: { profileId: "profile-1" },

    metadata: overrides.metadata ?? {},
  };
}

describe("SqliteVectorStore", () => {
  it("upserts and searches vectors with cosine similarity", async () => {
    const store = new SqliteVectorStore(getTestDatabase().sqlite);

    await store.upsert([
      record({ id: "vec-a", text: "typescript", vector: vectorA }),

      record({ id: "vec-b", text: "react", vector: vectorB }),

      record({ id: "vec-c", text: "typescript react", vector: vectorC }),
    ]);

    const results = await store.search(vectorA, {
      limit: 10,

      minScore: 0,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);

    // Exact match (vec-a) should score highest.
    expect(results[0].record.id).toBe("vec-a");

    expect(results[0].score).toBeCloseTo(1, 4);
  });

  it("filters by source type and source id", async () => {
    const store = new SqliteVectorStore(getTestDatabase().sqlite);

    await store.upsert([
      record({
        id: "vec-1",

        sourceType: "document",

        sourceId: "doc-1",

        vector: vectorA,
      }),

      record({
        id: "vec-2",

        sourceType: "memory",

        sourceId: "doc-1",

        vector: vectorB,
      }),

      record({
        id: "vec-3",

        sourceType: "document",

        sourceId: "doc-2",

        vector: vectorC,
      }),
    ]);

    const docs = await store.search(vectorA, {
      sourceTypes: ["document"],

      limit: 10,

      minScore: 0,
    });

    expect(docs.every((r) => r.record.sourceType === "document")).toBe(true);

    const doc1 = await store.search(vectorA, {
      sourceTypes: ["document"],

      sourceIds: ["doc-1"],

      limit: 10,

      minScore: 0,
    });

    expect(doc1.every((r) => r.record.sourceId === "doc-1")).toBe(true);
  });

  it("returns empty when nothing matches minScore", async () => {
    const store = new SqliteVectorStore(getTestDatabase().sqlite);

    await store.upsert([record({ id: "vec-1", vector: vectorA })]);

    const orthogonal = [0.0, 1.0, 0.0, 0.0, 0.0];

    const results = await store.search(orthogonal, {
      limit: 10,

      minScore: 0.9,
    });

    expect(results).toHaveLength(0);
  });

  it("persists vectors across a simulated restart", async () => {
    const db = getTestDatabase().sqlite;

    const store = new SqliteVectorStore(db);

    await store.upsert([record({ id: "persist-vec", vector: vectorA })]);

    // New store instance over the same connection/database.
    const store2 = new SqliteVectorStore(db);

    const results = await store2.search(vectorA, {
      limit: 10,

      minScore: 0,
    });

    expect(results.length).toBe(1);
    expect(results[0].record.id).toBe("persist-vec");
  });

  it("deletes vectors by context id", async () => {
    const store = new SqliteVectorStore(getTestDatabase().sqlite);

    await store.upsert([
      record({ id: "vec-1", contextId: "ctx-to-delete" }),

      record({ id: "vec-2", contextId: "ctx-keep" }),
    ]);

    await store.deleteByContext("ctx-to-delete");

    const remaining = await store.search(vectorA, {
      limit: 10,

      minScore: 0,
    });

    expect(remaining.map((r) => r.record.id)).not.toContain("vec-1");

    expect(remaining.map((r) => r.record.id)).toContain("vec-2");
  });

  it("rejects invalid vectors", async () => {
    const store = new SqliteVectorStore(getTestDatabase().sqlite);

    await expect(
      store.upsert([record({ id: "bad", vector: [] as number[] })]),
    ).rejects.toThrow();

    // A query with the wrong dimensionality is skipped gracefully
    // (returns no results) rather than throwing.
    const results = await store.search([1, 2] as number[], {
      limit: 5,

      minScore: 0,
    });

    expect(results).toHaveLength(0);
  });
});
