import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import { UnifiedInterviewRuntime } from "../../../core/interview/runtime/UnifiedInterviewRuntime";
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

function makeRuntime(overrides?: {
  resolveProfileId?: () => string | undefined;
  retrieveCandidateContext?: (
    profileId: string,
    candidateId: string | undefined,
    query: string,
    signal?: AbortSignal,
  ) => Promise<readonly { readonly id: string; readonly source: "candidate" | "memory" | "context"; readonly text: string; readonly verified?: boolean }[]>;
}) {
  const sessionRepo = new SessionRepository();
  const questionRepo = new QuestionRepository();
  const answerRepo = new AnswerRepository();

  return new UnifiedInterviewRuntime({
    interviewIntelligence: new InterviewIntelligence(),
    sessionRepository: sessionRepo,
    questionRepository: questionRepo,
    answerRepository: answerRepo,
    resolveProfileId: overrides?.resolveProfileId,
    retrieveCandidateContext: overrides?.retrieveCandidateContext,
  });
}

describe("Phase 12 integration: document/evidence/profile isolation/gap pipeline", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("keeps candidate evidence scoped to the active profile across live sessions", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-a", "Profile A");
    insertProfile("profile-b", "Profile B");

    const runtimeA = makeRuntime({
      resolveProfileId: () => "profile-a",
      retrieveCandidateContext: async (profileId) => [
        {
          id: "ev-a-1",
          source: "candidate",
          text: "A: led cloud migration reducing latency by 35%.",
          verified: true,
        },
      ],
    });
    const runtimeB = makeRuntime({
      resolveProfileId: () => "profile-b",
      retrieveCandidateContext: async (_profileId) => [
        {
          id: "ev-b-1",
          source: "candidate",
          text: "B: managed nursing shift rosters for 20-bed ward.",
          verified: true,
        },
      ],
    });

    const sessionA = await runtimeA.createSession({
      profileId: "profile-a",
      candidateId: "cand-a",
      mode: "live",
      targetRole: "Site Reliability Engineer",
      domain: "software_engineering",
    });
    await runtimeA.startSession(sessionA.sessionId);
    const qa = await runtimeA.processQuestion({
      sessionId: sessionA.sessionId,
      text: "Describe a time you improved system reliability.",
      source: "voice_transcript",
    });

    const sessionB = await runtimeB.createSession({
      profileId: "profile-b",
      candidateId: "cand-b",
      mode: "live",
      targetRole: "Nurse",
      domain: "healthcare",
    });
    await runtimeB.startSession(sessionB.sessionId);
    const qb = await runtimeB.processQuestion({
      sessionId: sessionB.sessionId,
      text: "Describe how you prioritize patient care.",
      source: "voice_transcript",
    });

    // Evidence must not leak across profiles.
    expect(qa.provenance.candidateEvidenceIds).toContain("ev-a-1");
    expect(qa.provenance.candidateEvidenceIds).not.toContain("ev-b-1");
    expect(qb.provenance.candidateEvidenceIds).toContain("ev-b-1");
    expect(qb.provenance.candidateEvidenceIds).not.toContain("ev-a-1");

    // Each session is grounded in its own profile's evidence.
    expect(qa.provenance.factsGrounded).toBe(true);
    expect(qb.provenance.factsGrounded).toBe(true);

    // Profile isolation at the persistence layer.
    await expect(runtimeB.getState(sessionA.sessionId)).rejects.toThrow(/profile/i);
  });

  it("routes questions through domain classification and understanding for multiple professions", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime({
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });

    const cases: Array<{ domain: string; role: string; question: string }> = [
      { domain: "software_engineering", role: "Software Engineer", question: "Explain how you would design a rate limiter." },
      { domain: "healthcare", role: "Nurse", question: "How do you handle a medication discrepancy during a shift?" },
      { domain: "finance", role: "Financial Analyst", question: "Walk me through a discounted cash flow valuation." },
      { domain: "business_management", role: "Product Manager", question: "How would you prioritize features for the next quarter?" },
    ];

    for (const c of cases) {
      const session = await runtime.createSession({
        profileId: "profile-1",
        candidateId: "cand-1",
        mode: "live",
        targetRole: c.role,
        domain: c.domain as any,
      });
      await runtime.startSession(session.sessionId);
      const res = await runtime.processQuestion({
        sessionId: session.sessionId,
        text: c.question,
        source: "typed",
      });

      expect(res.questionText).toBe(c.question);
      // Domain is classified from question text; classification must produce a recognized domain.
      expect(typeof res.domain.primaryDomain).toBe("string");
      expect(res.domain.primaryDomain.length).toBeGreaterThan(0);
      expect(res.understanding.coreIntent.length).toBeGreaterThan(0);
      expect(res.confidence).toBeGreaterThanOrEqual(0);
      expect(res.confidence).toBeLessThanOrEqual(1);
      // No evidence injected => facts not grounded, missing info declared.
      expect(qaFactsGrounded(res)).toBe(false);
    }
  });

  it("declares missing information when no candidate evidence is retrieved", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime({
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Manager",
      domain: "business_management",
    });
    await runtime.startSession(session.sessionId);

    const res = await runtime.processQuestion({
      sessionId: session.sessionId,
      text: "Tell me about a time you resolved a team conflict.",
      source: "voice_transcript",
    });

    expect(res.provenance.factsGrounded).toBe(false);
    expect(res.provenance.candidateEvidenceIds).toHaveLength(0);
    expect(res.provenance.assumptions.length).toBeGreaterThan(0);
    expect(res.ai?.executed).toBe(false);
  });

  it("grounds guidance in retrieved candidate evidence with provenance", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime({
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async (_profileId, _candidateId, _query) => [
        {
          id: "ev-resume-1",
          source: "candidate",
          text: "Reduced incident response time by 40% through runbook automation.",
          verified: true,
        },
        {
          id: "ev-memory-1",
          source: "memory",
          text: "Led post-mortem culture initiative across engineering.",
          verified: true,
        },
      ],
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Site Reliability Engineer",
      domain: "software_engineering",
    });
    await runtime.startSession(session.sessionId);

    const res = await runtime.processQuestion({
      sessionId: session.sessionId,
      text: "Describe a time you improved incident response.",
      source: "voice_transcript",
      generateAI: false,
    });

    expect(res.provenance.factsGrounded).toBe(true);
    expect(res.provenance.candidateEvidenceIds).toContain("ev-resume-1");
    expect(res.provenance.memoryIds).toContain("ev-memory-1");
    expect(res.evidence.some((e) => e.id === "ev-resume-1")).toBe(true);
    expect(res.guidance.talkingPoints.length).toBeGreaterThan(0);
    expect(res.questionId).toBeTruthy();
  });

  it("persists and recovers a live session across runtime instances", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime1 = makeRuntime({
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });

    const created = await runtime1.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await runtime1.startSession(created.sessionId);
    await runtime1.processQuestion({
      sessionId: created.sessionId,
      text: "What is your greatest strength?",
      source: "typed",
    });

    const runtime2 = makeRuntime({
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });
    const recovered = await runtime2.getState(created.sessionId);
    expect(recovered.sessionId).toBe(created.sessionId);
    expect(recovered.profileId).toBe("profile-1");
    expect(recovered.mode).toBe("live");
    expect(recovered.status).toBe("active");

    await runtime2.pauseSession(created.sessionId);
    const paused = await runtime2.getState(created.sessionId);
    expect(paused.status).toBe("paused");

    await runtime2.resumeSession(created.sessionId);
    const resumed = await runtime2.getState(created.sessionId);
    expect(resumed.status).toBe("active");
  });

  it("completes a live session and persists a report", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime({
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });

    const created = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
      questionCount: 1,
    });
    await runtime.startSession(created.sessionId);
    const q = await runtime.processQuestion({
      sessionId: created.sessionId,
      text: "Describe a technical challenge you overcame.",
      source: "typed",
      generateAI: false,
    });
    const a = await runtime.submitAnswer({
      sessionId: created.sessionId,
      questionId: q.questionId!,
      answerText: "I refactored a legacy module and cut build times by 25%.",
    });
    expect(a.evaluation.overallScore).toBeGreaterThan(0);
    // Live sessions require explicit completion; practice auto-completes.
    expect(a.completed).toBe(false);

    await runtime.completeSession(created.sessionId);
    const finalState = await runtime.getState(created.sessionId);
    expect(finalState.status).toBe("completed");
  });
});

function qaFactsGrounded(res: { readonly provenance: { readonly factsGrounded: boolean } }): boolean {
  return res.provenance.factsGrounded;
}
