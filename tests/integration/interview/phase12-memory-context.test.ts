import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { MemoryRepository } from "../../../database/repositories/memoryRepository";
import { SessionRepository } from "../../../database/repositories/sessionRepository";
import { createTestDatabase, destroyTestDatabase, getTestDatabase } from "../../helpers/database";

function insertProfile(id = "profile-1", name = "Test Profile") {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
     VALUES (?, ?, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, name);
}

function createMemory(repo: MemoryRepository, input: {
  readonly profileId: string;
  readonly category: "candidate" | "conversation" | "session" | "preference" | "knowledge";
  readonly contentText: string;
  readonly sourceType: string;
  readonly confidence?: number;
  readonly verificationStatus?: "verified" | "inferred" | "missing" | "unverified";
}) {
  return repo.create({
    profileId: input.profileId,
    category: input.category,
    content: { text: input.contentText },
    sourceType: input.sourceType,
    sourceId: randomUUID(),
    sourceName: "test",
    confidence: input.confidence ?? 60,
    verificationStatus: input.verificationStatus ?? "inferred",
  });
}

describe("Phase 12 integration: memory/context retrieval and profile isolation", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("retrieves profile-scoped candidate memory and isolates profiles", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1", "Profile A");
    insertProfile("profile-2", "Profile B");

    const repo1 = new MemoryRepository();
    const repo2 = new MemoryRepository();

    createMemory(repo1, {
      profileId: "profile-1",
      category: "candidate",
      contentText: "Reduced incident response time by 40% through runbook automation.",
      sourceType: "document",
      confidence: 80,
      verificationStatus: "verified",
    });
    createMemory(repo1, {
      profileId: "profile-1",
      category: "conversation",
      contentText: "Prefers STAR-format behavioral answers.",
      sourceType: "conversation",
      confidence: 70,
    });
    createMemory(repo2, {
      profileId: "profile-2",
      category: "candidate",
      contentText: "Managed nursing shift rosters for a 20-bed ward.",
      sourceType: "document",
      confidence: 80,
      verificationStatus: "verified",
    });

    // Profile-1 search returns only profile-1 memories.
    const results1 = repo1.search("profile-1", {
      query: "runbook automation incident response",
      minConfidence: 40,
      limit: 10,
    });
    expect(results1.length).toBeGreaterThanOrEqual(1);
    expect(results1.every((r) => r.profileId === "profile-1")).toBe(true);
    expect(results1.some((r) => r.content.text.includes("runbook automation"))).toBe(true);

    // Profile-2 search returns only profile-2 memories (profile isolation).
    const results2 = repo2.search("profile-2", {
      query: "nursing shift rosters",
      minConfidence: 40,
      limit: 10,
    });
    expect(results2.length).toBeGreaterThanOrEqual(1);
    expect(results2.every((r) => r.profileId === "profile-2")).toBe(true);
    expect(results2.some((r) => r.content.text.includes("nursing shift rosters"))).toBe(true);

    // Cross-profile query returns nothing for the other profile.
    const cross = repo1.search("profile-1", {
      query: "nursing shift rosters",
      minConfidence: 40,
      limit: 10,
    });
    expect(cross.every((r) => r.profileId === "profile-1")).toBe(true);
    expect(cross.some((r) => r.content.text.includes("nursing shift rosters"))).toBe(false);
  });

  it("filters memory by confidence and category", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const repo = new MemoryRepository();
    createMemory(repo, {
      profileId: "profile-1",
      category: "candidate",
      contentText: "High confidence verified achievement.",
      sourceType: "document",
      confidence: 90,
      verificationStatus: "verified",
    });
    createMemory(repo, {
      profileId: "profile-1",
      category: "preference",
      contentText: "Low confidence inferred preference.",
      sourceType: "conversation",
      confidence: 30,
      verificationStatus: "inferred",
    });

    const highConf = repo.search("profile-1", {
      query: "achievement",
      minConfidence: 80,
      limit: 10,
    });
    expect(highConf.every((r) => (r.confidence ?? 0) >= 80)).toBe(true);

    const candidateOnly = repo.search("profile-1", {
      query: "preference",
      category: "candidate",
      minConfidence: 40,
      limit: 10,
    });
    expect(candidateOnly.every((r) => r.category === "candidate")).toBe(true);
  });

  it("session creation is profile-scoped", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");
    insertProfile("profile-2");

    const sessionRepo = new SessionRepository();
    const s1 = sessionRepo.create({
      profileId: "profile-1",
      title: "Session A",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", candidateId: "cand-1" },
    });
    const s2 = sessionRepo.create({
      profileId: "profile-2",
      title: "Session B",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", candidateId: "cand-2" },
    });

    expect(sessionRepo.getById(s1.id).profileId).toBe("profile-1");
    expect(sessionRepo.getById(s2.id).profileId).toBe("profile-2");
    expect(s1.id).not.toBe(s2.id);
  });
});
