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

  it("isolates interview memory by candidate and returns profile preferences separately", () => {
    const candidateOne = "8f0b2f3e-4678-4bdb-97f6-06e1e4482b01";
    const candidateTwo = "e84079af-dd13-41c8-9d8b-44b2022a7055";
    const sqlite = getTestDatabase().sqlite;
    sqlite.prepare(
      `INSERT INTO candidate_profiles
         (profile_id, candidate_id, full_name, payload, created_at, updated_at)
       VALUES (?, ?, ?, '{}', 'now', 'now'), (?, ?, ?, '{}', 'now', 'now')`,
    ).run(profileA, candidateOne, "Candidate One", profileA, candidateTwo, "Candidate Two");
    const repo = new MemoryRepository();
    repo.create({
      profileId: profileA,
      candidateId: candidateOne,
      category: "candidate",
      content: { text: "Led a forecasting project." },
      sourceType: "manual",
    });
    repo.create({
      profileId: profileA,
      candidateId: candidateTwo,
      category: "candidate",
      content: { text: "Prepared a forecasting model." },
      sourceType: "manual",
    });
    repo.create({
      profileId: profileA,
      category: "preference",
      content: { text: "Prefers concise interview answers." },
      sourceType: "manual",
    });

    expect(
      repo.search(profileA, { query: "forecasting", category: "candidate", candidateId: candidateOne })
        .map((record) => record.content.text),
    ).toEqual(["Led a forecasting project."]);
    expect(
      repo.search(profileA, { query: "forecasting", category: "candidate", candidateId: candidateTwo })
        .map((record) => record.content.text),
    ).toEqual(["Prepared a forecasting model."]);
    expect(
      repo.search(profileA, { query: "concise", category: "preference", candidateId: null })
        .map((record) => record.content.text),
    ).toEqual(["Prefers concise interview answers."]);
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

  it("performs genuine FTS5 search scoped to profile", () => {
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
    expect(results.some((r) => r.content.text === "TypeScript and React expertise")).toBe(true);

    // Profile B's matching record must not leak into profile A's results.
    expect(results.some((r) => r.profileId === profileB)).toBe(false);

    // A term present only in profile B returns nothing for profile A.
    repo.create({
      profileId: profileB,

      category: "candidate",

      content: { text: "profile B exclusive Svelte fact" },

      sourceType: "document",

      sourceId: "doc-3",

      confidence: 90,
    });

    const exclusive = repo.search(profileA, { query: "Svelte", limit: 10 });

    expect(exclusive.length).toBe(0);
  });

  it("excludes expired memory from FTS search and profile listing", () => {
    const repo = new MemoryRepository();
    const expired = repo.create({
      profileId: profileA,
      category: "knowledge",
      content: { text: "expired React fact" },
      sourceType: "document",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    expect(repo.listByProfile(profileA)).toEqual([]);
    expect(repo.search(profileA, { query: "React" })).toEqual([]);
    expect(repo.getById(expired.id, profileA)).toBeNull();
    expect(repo.expireOlderThan(new Date().toISOString())).toBe(1);
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

    expect(repo.getById(oldRecord.id, profileA)).toBeNull();
    expect(repo.getById(current.id, profileA)?.status).toBe("active");
  });
});
