import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { CandidateEvidenceRepository } from "../../../database/repositories/candidateEvidenceRepository";
import {
  createDatabase,
  overrideDatabaseForTesting,
} from "../../../database/client";

import {
  createTestDatabase,

  destroyTestDatabase,

  getTestDatabase,
} from "../../../tests/helpers/database";

const META = { profileId: "profile-1" };

function evidence(overrides: Record<string, unknown> = {}): any {
  return Object.freeze({
    id: "ev-1",

    candidateId: "cand-1",

    type: "skill",

    text: "TypeScript expertise",

    sourceId: undefined,

    sourceName: undefined,

    verified: true,

    confidence: 90,

    metadata: META,

    ...overrides,
  });
}

describe("CandidateEvidenceRepository", () => {
  let repository: CandidateEvidenceRepository;

  let dbPath: string;

  let activeProfileId: string | undefined;

  beforeEach(async () => {
    dbPath = await createTestDatabase();

    activeProfileId = "profile-1";
    repository = new CandidateEvidenceRepository(() => activeProfileId);

    // Foreign key requires a parent profile row.
    getTestDatabase()
      .sqlite.prepare(
        "INSERT OR IGNORE INTO profiles (id, display_name, email, created_at, updated_at) VALUES ('profile-1', 'Profile One', 'one@example.com', 'now', 'now'), ('profile-2', 'Profile Two', 'two@example.com', 'now', 'now')",
      )
      .run();
  });

  afterEach(async () => {
    await destroyTestDatabase(dbPath);
  });

  it("persists and lists candidate evidence scoped to candidate", async () => {
    await repository.save(evidence({ id: "ev-1", candidateId: "cand-1", text: "TypeScript expertise" }));

    await repository.save(evidence({ id: "ev-2", candidateId: "cand-1", text: "Led the Veyra migration", verified: false, confidence: 80 }));

    await repository.save(evidence({ id: "ev-3", candidateId: "cand-2", text: "Python expertise", confidence: 70 }));

    const cand1 = await repository.list("cand-1");

    expect(cand1.length).toBe(2);

    expect(cand1.every((e) => e.candidateId === "cand-1")).toBe(true);

    const cand2 = await repository.list("cand-2");

    expect(cand2.length).toBe(1);

    expect(cand2[0].text).toBe("Python expertise");
  });

  it("gets a single evidence record by id", async () => {
    await repository.save(evidence({ id: "ev-1", candidateId: "cand-1", text: "TypeScript expertise", verified: true, confidence: 90 }));

    const found = await repository.get("cand-1", "ev-1");

    expect(found).toBeDefined();

    expect(found?.text).toBe("TypeScript expertise");

    expect(found?.verified).toBe(true);

    expect(found?.confidence).toBe(90);

    expect(await repository.get("cand-1", "missing")).toBeUndefined();

    expect(await repository.get("cand-2", "ev-1")).toBeUndefined();
  });

  it("updates an existing evidence record", async () => {
    await repository.save(evidence({ id: "ev-1", candidateId: "cand-1", text: "TypeScript expertise", confidence: 50 }));

    await repository.save(evidence({ id: "ev-1", candidateId: "cand-1", text: "TypeScript and React expertise", confidence: 95 }));

    const updated = await repository.get("cand-1", "ev-1");

    expect(updated?.text).toBe("TypeScript and React expertise");

    expect(updated?.confidence).toBe(95);
  });

  it("removes an evidence record", async () => {
    await repository.save(evidence({ id: "ev-1", candidateId: "cand-1", text: "TypeScript expertise", confidence: 90 }));

    expect((await repository.list("cand-1")).length).toBe(1);

    await repository.remove("cand-1", "ev-1");

    expect((await repository.list("cand-1")).length).toBe(0);
  });

  it("removes all evidence for a source", async () => {
    await repository.save(evidence({ id: "ev-1", candidateId: "cand-1", text: "A", sourceId: "doc-1", confidence: 90 }));

    await repository.save(evidence({ id: "ev-2", candidateId: "cand-1", text: "B", sourceId: "doc-2", confidence: 80 }));

    await repository.save(evidence({ id: "ev-3", candidateId: "cand-1", text: "C", sourceId: "doc-3", confidence: 70 }));

    await repository.removeBySource("doc-1");

    const remaining = await repository.list("cand-1");

    expect(remaining.length).toBe(2);

    expect(remaining.some((r) => r.sourceId === "doc-1")).toBe(false);
  });

  it("removes a source across candidates but only within the active profile", async () => {
    await repository.save(
      evidence({
        id: "profile-one-doc-evidence",
        candidateId: "candidate-one",
        sourceId: "shared-document",
        text: "Profile one",
      }),
    );
    activeProfileId = "profile-2";
    await repository.save(
      evidence({
        id: "profile-two-doc-evidence",
        candidateId: "candidate-two",
        sourceId: "shared-document",
        text: "Profile two",
      }),
    );

    activeProfileId = "profile-1";
    await repository.removeBySource("shared-document");
    expect(await repository.list("candidate-one")).toEqual([]);

    activeProfileId = "profile-2";
    await expect(repository.list("candidate-two")).resolves.toHaveLength(1);
  });

  it("throws when required fields are missing", async () => {
    await expect(
      repository.save(evidence({ id: "", candidateId: "cand-1", text: "x", confidence: 50 })),
    ).rejects.toThrow();

    await expect(
      repository.save(evidence({ id: "ev-1", candidateId: "", text: "x", confidence: 50 })),
    ).rejects.toThrow();

    await expect(
      repository.save(evidence({ id: "ev-1", candidateId: "cand-1", type: "", text: "x", confidence: 50 })),
    ).rejects.toThrow();

    await expect(
      repository.save(evidence({ id: "ev-1", candidateId: "cand-1", type: "skill", text: "", confidence: 50 })),
    ).rejects.toThrow();
  });

  it("isolates matching candidate IDs across active profiles", async () => {
    await repository.save(
      evidence({
        id: "profile-one-evidence",
        candidateId: "same-candidate",
        text: "Profile one fact",
      }),
    );

    activeProfileId = "profile-2";
    await repository.save(
      evidence({
        id: "profile-two-evidence",
        candidateId: "same-candidate",
        text: "Profile two fact",
      }),
    );

    expect(
      (await repository.list("same-candidate")).map((item) => item.text),
    ).toEqual(["Profile two fact"]);

    activeProfileId = "profile-1";
    expect(
      (await repository.list("same-candidate")).map((item) => item.text),
    ).toEqual(["Profile one fact"]);
  });

  it("does not allow another profile to overwrite an existing evidence ID", async () => {
    await repository.save(
      evidence({
        id: "shared-evidence-id",
        candidateId: "same-candidate",
        text: "Profile one fact",
      }),
    );

    activeProfileId = "profile-2";
    await expect(
      repository.save(
        evidence({
          id: "shared-evidence-id",
          candidateId: "same-candidate",
          text: "Profile two overwrite",
        }),
      ),
    ).rejects.toThrow("cannot be reassigned across profiles or candidates");
  });

  it("fails closed when no active profile is available", async () => {
    activeProfileId = undefined;

    await expect(repository.list("cand-1")).rejects.toThrow(
      "An active profile is required for candidate evidence.",
    );
    await expect(repository.save(evidence())).rejects.toThrow(
      "An active profile is required for candidate evidence.",
    );
  });

  it("persists evidence across a database reopen", async () => {
    await repository.save(
      evidence({
        id: "persisted-evidence",
        candidateId: "candidate-restart",
        text: "Survives restart",
      }),
    );

    getTestDatabase().close();
    overrideDatabaseForTesting(createDatabase({ filename: dbPath }));
    repository = new CandidateEvidenceRepository(() => activeProfileId);

    await expect(repository.list("candidate-restart")).resolves.toMatchObject([
      { id: "persisted-evidence", text: "Survives restart" },
    ]);
  });
});
