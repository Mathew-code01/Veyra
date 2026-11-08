import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { MemoryRepository } from "../../../database/repositories/memoryRepository";

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

describe("MemoryRepository", () => {
  it("creates and retrieves candidate memory with source tracing", () => {
    const repo = new MemoryRepository();

    const record = repo.create({
      profileId: profileA,

      category: "candidate",

      content: {
        value: { skill: "TypeScript", years: 5 },

        text: "TypeScript with 5 years experience.",
      },

      sourceType: "document",

      sourceId: "doc-1",

      sourceName: "cv.pdf",

      confidence: 90,

      verificationStatus: "verified",

      extractionVersion: "1.0.0",
    });

    expect(record.id).toBeDefined();
    expect(record.profileId).toBe(profileA);
    expect(record.category).toBe("candidate");
    expect(record.confidence).toBe(90);
    expect(record.verificationStatus).toBe("verified");
    expect(record.sourceType).toBe("document");
    expect(record.sourceId).toBe("doc-1");
    expect(record.sourceName).toBe("cv.pdf");
    expect(record.status).toBe("active");
    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();

    const fetched = repo.getById(record.id, profileA);

    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(record.id);
    expect(fetched?.content.text).toBe("TypeScript with 5 years experience.");
    expect(fetched?.lastAccessedAt).toBeDefined();
  });

  it("returns null for a missing memory", () => {
    const repo = new MemoryRepository();

    expect(repo.getById("does-not-exist", profileA)).toBeNull();
  });

  it("isolates memory between profiles", () => {
    const repo = new MemoryRepository();

    const recA = repo.create({
      profileId: profileA,

      category: "candidate",

      content: { text: "profile A fact" },

      sourceType: "manual",

      confidence: 80,
    });

    repo.create({
      profileId: profileB,

      category: "candidate",

      content: { text: "profile B fact" },

      sourceType: "manual",

      confidence: 70,
    });

    const listA = repo.listByProfile(profileA);

    expect(listA).toHaveLength(1);
    expect(listA[0].id).toBe(recA.id);

    const listB = repo.listByProfile(profileB);

    expect(listB).toHaveLength(1);
    expect(listB[0].content.text).toBe("profile B fact");

    // Profile B cannot read profile A's record by ID.
    expect(repo.getById(recA.id, profileB)).toBeNull();
  });

  it("filters list by category", () => {
    const repo = new MemoryRepository();

    repo.create({
      profileId: profileA,

      category: "preference",

      content: { text: "prefers concise answers" },

      sourceType: "manual",

      confidence: 100,
    });

    repo.create({
      profileId: profileA,

      category: "candidate",

      content: { text: "knows TypeScript" },

      sourceType: "manual",

      confidence: 90,
    });

    const preferences = repo.listByProfile(profileA, { category: "preference" });

    expect(preferences).toHaveLength(1);
    expect(preferences[0].category).toBe("preference");

    const candidates = repo.listByProfile(profileA, { category: "candidate" });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].category).toBe("candidate");
  });

  it("updates a memory record", () => {
    const repo = new MemoryRepository();

    const record = repo.create({
      profileId: profileA,

      category: "preference",

      content: { text: "original" },

      sourceType: "manual",

      confidence: 50,

      verificationStatus: "unverified",
    });

    const updated = repo.update(record.id, profileA, {
      content: { text: "updated preference text" },

      confidence: 100,

      verificationStatus: "verified",

      status: "active",
    });

    expect(updated).not.toBeNull();
    expect(updated?.content.text).toBe("updated preference text");
    expect(updated?.confidence).toBe(100);
    expect(updated?.verificationStatus).toBe("verified");
    expect(updated?.updatedAt).not.toBe(record.updatedAt);

    // Updating another profile's record returns null.
    const crossProfile = repo.update(record.id, profileB, {
      content: { text: "tamper" },
    });

    expect(crossProfile).toBeNull();
  });

  it("soft-deletes a memory record", () => {
    const repo = new MemoryRepository();

    const record = repo.create({
      profileId: profileA,

      category: "session",

      content: { text: "session fact" },

      sourceType: "session",

      confidence: 60,
    });

    const deleted = repo.softDelete(record.id, profileA);

    expect(deleted).toBe(true);

    expect(repo.getById(record.id, profileA)?.status).toBe("deleted");

    const remaining = repo.listByProfile(profileA);

    expect(remaining).toHaveLength(0);

    // Deleting another profile's record returns false.
    const crossProfile = repo.softDelete(record.id, profileB);

    expect(crossProfile).toBe(false);
  });

  it("excludes soft-deleted records from search and list", () => {
    const repo = new MemoryRepository();

    repo.create({
      profileId: profileA,

      category: "knowledge",

      content: { text: "retained fact about React" },

      sourceType: "manual",

      confidence: 80,
    });

    const toDelete = repo.create({
      profileId: profileA,

      category: "knowledge",

      content: { text: "deleted fact about Vue" },

      sourceType: "manual",

      confidence: 80,
    });

    repo.softDelete(toDelete.id, profileA);

    const results = repo.search(profileA, { query: "fact" });

    expect(results.map((r) => r.content.text)).not.toContain(
      "deleted fact about Vue",
    );
    expect(results.map((r) => r.content.text)).toContain(
      "retained fact about React",
    );
  });

  it("performs keyword (FTS5) search scoped to profile", () => {
    const repo = new MemoryRepository();

    repo.create({
      profileId: profileA,

      category: "candidate",

      content: { text: "TypeScript and React expertise" },

      sourceType: "document",

      sourceId: "doc-1",

      confidence: 90,
    });

    repo.create({
      profileId: profileB,

      category: "candidate",

      content: { text: "TypeScript and React expertise" },

      sourceType: "document",

      sourceId: "doc-2",

      confidence: 90,
    });

    const results = repo.search(profileA, { query: "React", limit: 10 });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.profileId === profileA)).toBe(true);
  });

  it("applies minConfidence filtering", () => {
    const repo = new MemoryRepository();

    repo.create({
      profileId: profileA,

      category: "candidate",

      content: { text: "low confidence fact" },

      sourceType: "manual",

      confidence: 30,
    });

    repo.create({
      profileId: profileA,

      category: "candidate",

      content: { text: "high confidence fact" },

      sourceType: "manual",

      confidence: 90,
    });

    const results = repo.search(profileA, {
      query: "fact",
      minConfidence: 50,
    });

    expect(results.length).toBe(1);
    expect(results[0].confidence).toBe(90);
  });

  it("expires memories older than a cutoff", () => {
    const repo = new MemoryRepository();

    const oldRecord = repo.create({
      profileId: profileA,

      category: "session",

      content: { text: "old session fact" },

      sourceType: "session",

      expiresAt: "2020-01-01T00:00:00.000Z",

      confidence: 50,
    });

    const current = repo.create({
      profileId: profileA,

      category: "session",

      content: { text: "current session fact" },

      sourceType: "session",

      expiresAt: "2099-01-01T00:00:00.000Z",

      confidence: 50,
    });

    const expiredCount = repo.expireOlderThan("2025-01-01T00:00:00.000Z");

    expect(expiredCount).toBe(1);

    expect(repo.getById(oldRecord.id, profileA)?.status).toBe("expired");
    expect(repo.getById(current.id, profileA)?.status).toBe("active");
  });
});
