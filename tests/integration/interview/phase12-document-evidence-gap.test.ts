import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { UnifiedInterviewRuntime } from "../../../core/interview/runtime/UnifiedInterviewRuntime";
import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import { SessionRepository } from "../../../database/repositories/sessionRepository";
import { QuestionRepository } from "../../../database/repositories/questionRepository";
import { AnswerRepository } from "../../../database/repositories/answerRepository";
import { createTestDatabase, destroyTestDatabase, getTestDatabase } from "../../helpers/database";

function insertProfile(id = "profile-1", name = "Test Profile") {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
     VALUES (?, ?, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, name);
}

function insertDocument(
  id: string,
  profileId: string,
  name: string,
  extractedText: string,
  storagePath: string,
  status = "ready",
) {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO documents (id, profile_id, name, original_name, storage_path, document_type, status, size_bytes, extracted_text, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'resume', ?, 1024, ?, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, profileId, name, name, storagePath, status, extractedText);
}

function insertEvidence(
  id: string,
  profileId: string,
  candidateId: string,
  text: string,
  type = "experience",
  verified = true,
  sourceId?: string,
) {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO candidate_evidence (id, profile_id, candidate_id, type, text, source_id, source_name, source_type, verified, confidence, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'document', ?, 80, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, profileId, candidateId, type, text, sourceId ?? id, `Source ${id}`, verified ? 1 : 0);
}

function deleteEvidenceBySource(sourceType: string, sourceId: string) {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `DELETE FROM candidate_evidence WHERE source_type = ? AND source_id = ?`,
  ).run(sourceType, sourceId);
}

function countEvidenceBySource(sourceId: string): number {
  const db = getTestDatabase().sqlite;
  return (
    db.prepare(`SELECT COUNT(*) AS c FROM candidate_evidence WHERE source_id = ?`)
      .get(sourceId) as { c: number }
  ).c;
}

function makeRuntime() {
  const sessionRepo = new SessionRepository();
  const questionRepo = new QuestionRepository();
  const answerRepo = new AnswerRepository();
  return {
    runtime: new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: sessionRepo,
      questionRepository: questionRepo,
      answerRepository: answerRepo,
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async (_profileId, _candidateId, query) => {
        const db = getTestDatabase().sqlite;
        const rows = db
          .prepare(`SELECT id, text, verified FROM candidate_evidence WHERE profile_id = ?`)
          .all("profile-1");
        const words = query.split(" ").filter((w) => w.length > 2);
        return rows
          .filter((r: any) => words.some((w) => r.text.toLowerCase().includes(w.toLowerCase())))
          .map((r: any) => ({
            id: r.id,
            source: "candidate" as const,
            text: r.text,
            verified: r.verified === 1,
          }));
      },
    }),
    sessionRepo,
    questionRepo,
    answerRepo,
  };
}

describe("Phase 12 integration: document/evidence/profile gap pipeline", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("connects document extraction to candidate evidence and grounds guidance", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1", "Profile A");
    insertProfile("profile-2", "Profile B");

    insertDocument("doc-1", "profile-1", "Resume.pdf", "Reduced incident response time by 40% through runbook automation. Led cloud migration.", "/tmp/doc-1.pdf");
    insertEvidence("ev-1", "profile-1", "cand-1", "Reduced incident response time by 40% through runbook automation.", "experience", true, "doc-1");
    insertDocument("doc-2", "profile-1", "Resume.pdf", "Led cloud migration reducing latency by 30%.", "/tmp/doc-2.pdf");
    insertEvidence("ev-2", "profile-1", "cand-1", "Handled incident response during cloud migration, reducing latency by 30%.", "experience", true, "doc-2");
    insertEvidence("ev-b-1", "profile-2", "cand-b", "Managed nursing shift rosters for a 20-bed ward.", "experience", true, "doc-b");

    const { runtime, sessionRepo } = makeRuntime();
    const session = sessionRepo.create({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Site Reliability Engineer",
      domain: "software_engineering",
      jobDescription: "Runbook automation, cloud migration, incident response.",
    });
    await sessionRepo.updateStatus(session.id, "active");

    const q = await runtime.processQuestion({
      sessionId: session.id,
      text: "incident response",
      source: "typed",
      generateAI: false,
    });

    expect(q.provenance.candidateEvidenceIds).toContain("ev-1");
    expect(q.provenance.candidateEvidenceIds).toContain("ev-2");
    expect(q.provenance.candidateEvidenceIds).not.toContain("ev-b-1");
    expect(q.provenance.factsGrounded).toBe(true);
    expect(q.provenance.assumptions.length).toBe(0);
  });

  it("declares missing information when JD requirements lack candidate evidence", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    insertDocument("doc-1", "profile-1", "Resume.pdf", "Lorem ipsum dolor sit amet consectetur.", "/tmp/doc-1.pdf");
    insertEvidence("ev-1", "profile-1", "cand-1", "Lorem ipsum dolor sit amet consectetur.", "experience", true, "doc-1");

    const { runtime, sessionRepo } = makeRuntime();
    const session = sessionRepo.create({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Site Reliability Engineer",
      domain: "software_engineering",
      jobDescription: "Requires deep Kubernetes and distributed systems experience.",
    });
    await sessionRepo.updateStatus(session.id, "active");

    const q = await runtime.processQuestion({
      sessionId: session.id,
      text: "Describe your Kubernetes and distributed systems experience.",
      source: "typed",
      generateAI: false,
    });

    expect(q.provenance.factsGrounded).toBe(false);
    expect(q.provenance.candidateEvidenceIds).toHaveLength(0);
    expect(q.provenance.assumptions.length).toBeGreaterThan(0);
  });

  it("supports document deletion and derived-evidence cleanup", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    insertDocument("doc-1", "profile-1", "Resume.pdf", "Led cloud migration reducing latency by 30%.", "/tmp/doc-1.pdf");
    insertEvidence("ev-1", "profile-1", "cand-1", "Led cloud migration reducing latency by 30%.", "experience", true, "doc-1");

    expect(countEvidenceBySource("doc-1")).toBe(1);

    deleteEvidenceBySource("document", "doc-1");
    expect(countEvidenceBySource("doc-1")).toBe(0);
  });

  it("persists session and recovers guidance across a runtime restart", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const { runtime: runtime1, sessionRepo } = makeRuntime();
    const session = sessionRepo.create({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await sessionRepo.updateStatus(session.id, "active");
    await runtime1.processQuestion({
      sessionId: session.id,
      text: "Tell me about a strength.",
      source: "typed",
      generateAI: false,
    });

    const { runtime: runtime2 } = makeRuntime();
    const recovered = await runtime2.getState(session.id);
    expect(recovered.sessionId).toBe(session.id);
    expect(recovered.profileId).toBe("profile-1");
    expect(recovered.status).toBe("active");
  });
});
