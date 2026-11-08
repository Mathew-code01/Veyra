import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { SqliteDocumentStore } from "../../../core/documents/storage/SqliteDocumentStore";

import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

let dbPath: string;

beforeEach(async () => {
  dbPath = await createTestDatabase();

  const sqlite = getTestDatabase().sqlite;

  sqlite.exec(`
    DELETE FROM profiles;

    INSERT INTO profiles (id, display_name, email, created_at, updated_at)
    VALUES
      ('11111111-1111-1111-1111-111111111111', 'Profile A', 'a@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
      ('22222222-2222-2222-2222-222222222222', 'Profile B', 'b@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `);
});

afterEach(async () => {
  await destroyTestDatabase(dbPath);
});

const profileA = "11111111-1111-1111-1111-111111111111";

const profileB = "22222222-2222-2222-2222-222222222222";

function makeDocument(overrides: Partial<{
  id: string;

  profileId: string;

  filename: string;

  text: string;

  status: "pending" | "processing" | "ready" | "failed";

  mimeType: string;

  sizeBytes: number;

  checksum: string;
}> = {}): any {
  return {
    identity: {
      id: overrides.id ?? "doc-1",

      filename: overrides.filename ?? "cv.pdf",

      checksum: overrides.checksum ?? "abc123",
    },

    type: "pdf",

    text: overrides.text ?? "John Doe, Software Engineer, TypeScript, React.",

    metadata: {
      mimeType: overrides.mimeType ?? "application/pdf",

      pageCount: 2,

      wordCount: 40,

      sizeBytes: overrides.sizeBytes ?? 12345,

      storagePath: `/tmp/${overrides.id ?? "doc-1"}.pdf`,
    },

    paragraphs: [],

    headings: [],

    sections: [],

    tables: [],

    chunks: [],

    status: overrides.status ?? "completed",

    processedAt: "2026-01-01T00:00:00.000Z",

    warnings: [],

    profileId: overrides.profileId ?? profileA,
  };
}

describe("SqliteDocumentStore", () => {
  it("stores and retrieves a processed document", async () => {
    const store = new SqliteDocumentStore({ profileId: profileA });

    const document = makeDocument({ id: "doc-1", profileId: profileA });

    await store.save(document);

    expect(await store.exists("doc-1")).toBe(true);

    const retrieved = await store.getById("doc-1");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.identity.id).toBe("doc-1");
    expect(retrieved?.profileId).toBe(profileA);
    expect(retrieved?.text).toContain("Software Engineer");
    expect(retrieved?.status).toBe("completed");
    expect(retrieved?.metadata.mimeType).toBe("application/pdf");
    expect(retrieved?.warnings).toEqual([]);
  });

  it("isolates documents between profiles", async () => {
    const storeA = new SqliteDocumentStore({ profileId: profileA });

    const storeB = new SqliteDocumentStore({ profileId: profileB });

    await storeA.save(makeDocument({ id: "doc-a", profileId: profileA }));

    await storeB.save(makeDocument({ id: "doc-b", profileId: profileB }));

    expect(await storeA.exists("doc-a")).toBe(true);
    expect(await storeA.exists("doc-b")).toBe(false);

    expect(await storeB.exists("doc-b")).toBe(true);
    expect(await storeB.exists("doc-a")).toBe(false);

    const listA = await storeA.list();

    expect(listA).toHaveLength(1);
    expect(listA[0].identity.id).toBe("doc-a");

    const listB = await storeB.list();

    expect(listB).toHaveLength(1);
    expect(listB[0].identity.id).toBe("doc-b");
  });

  it("survives a simulated restart (new store instance, same DB)", async () => {
    const document = makeDocument({ id: "persist-1", profileId: profileA });

    {
      const store = new SqliteDocumentStore({ profileId: profileA });

      await store.save(document);

      expect(await store.exists("persist-1")).toBe(true);
    }

    // Simulate restart: a new store instance over the same database.
    const store2 = new SqliteDocumentStore({ profileId: profileA });

    expect(await store2.exists("persist-1")).toBe(true);

    const retrieved = await store2.getById("persist-1");

    expect(retrieved).not.toBeNull();
    expect(retrieved?.text).toContain("Software Engineer");
    expect(retrieved?.profileId).toBe(profileA);
  });

  it("updates document status", async () => {
    const store = new SqliteDocumentStore({ profileId: profileA });

    await store.save(makeDocument({ id: "status-1", profileId: profileA }));

    await store.updateStatus("status-1", "failed");

    const retrieved = await store.getById("status-1");

    expect(retrieved?.status).toBe("failed");
  });

  it("deletes a document", async () => {
    const store = new SqliteDocumentStore({ profileId: profileA });

    await store.save(makeDocument({ id: "del-1", profileId: profileA }));

    expect(await store.exists("del-1")).toBe(true);

    await store.delete("del-1");

    expect(await store.exists("del-1")).toBe(false);

    expect(await store.getById("del-1")).toBeNull();
  });

  it("returns false for missing document", async () => {
    const store = new SqliteDocumentStore({ profileId: profileA });

    expect(await store.exists("missing")).toBe(false);
    expect(await store.getById("missing")).toBeNull();
  });

  it("throws when saving without a profileId", async () => {
    const store = new SqliteDocumentStore();

    const document: any = makeDocument();

    delete document.profileId;

    await expect(store.save(document)).rejects.toThrow(/profileId/);
  });
});
