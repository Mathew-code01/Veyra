import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import { UnifiedInterviewRuntime } from "../../../core/interview/runtime/UnifiedInterviewRuntime";
import { SessionRepository } from "../../../database/repositories/sessionRepository";
import { QuestionRepository } from "../../../database/repositories/questionRepository";
import { AnswerRepository } from "../../../database/repositories/answerRepository";
import { createTestDatabase, destroyTestDatabase, getTestDatabase } from "../../helpers/database";
import { QuestionBoundaryDetector } from "../../../core/interview/live/QuestionBoundaryDetector";
import { LiveGuidanceEngine } from "../../../core/interview/live/LiveGuidanceEngine";

function insertProfile(id = "profile-1", name = "Test Profile") {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
     VALUES (?, ?, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, name);
}

function makeRuntime() {
  const sessionRepo = new SessionRepository();
  const questionRepo = new QuestionRepository();
  const answerRepo = new AnswerRepository();
  return new UnifiedInterviewRuntime({
    interviewIntelligence: new InterviewIntelligence(),
    sessionRepository: sessionRepo,
    questionRepository: questionRepo,
    answerRepository: answerRepo,
    resolveProfileId: () => "profile-1",
    retrieveCandidateContext: async (_profileId, _candidateId, _query) => [
      { id: "ev-1", source: "candidate", text: "Cut incident response time by 40% with runbook automation.", verified: true },
    ],
  });
}

describe("LiveGuidanceEngine", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("produces structured, evidence-grounded guidance for a new question", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime();
    const engine = new LiveGuidanceEngine({
      runtime,
      detector: new QuestionBoundaryDetector(),
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Site Reliability Engineer",
      domain: "software_engineering",
    });
    await runtime.startSession(session.sessionId);

    const guidance = await engine.produceGuidance({
      sessionId: session.sessionId,
      questionText: "Tell me about a time you improved incident response.",
    });

    expect(guidance).not.toBeNull();
    expect(guidance!.questionId).toBeTruthy();
    expect(guidance!.domain.primaryDomain).toBeDefined();
    expect(guidance!.competencies.length).toBeGreaterThan(0);
    expect(guidance!.mainPoint.length).toBeGreaterThan(0);
    expect(guidance!.structure.length).toBeGreaterThan(0);
    expect(guidance!.talkingPoints.length).toBeGreaterThan(0);
    expect(guidance!.evidence.length).toBeGreaterThan(0);
    expect(guidance!.evidence.some((e) => e.id === "ev-1")).toBe(true);
    expect(guidance!.confidence).toBeGreaterThanOrEqual(0);
    expect(guidance!.confidence).toBeLessThanOrEqual(1);
  });

  it("suppresses duplicate processing of the same question (debounce)", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime();
    const engine = new LiveGuidanceEngine({
      runtime,
      detector: new QuestionBoundaryDetector({ debounceMs: 5_000 }),
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await runtime.startSession(session.sessionId);

    const first = await engine.produceGuidance({
      sessionId: session.sessionId,
      questionText: "How do you prioritize competing incidents?",
    });
    const second = await engine.produceGuidance({
      sessionId: session.sessionId,
      questionText: "How do you prioritize competing incidents?",
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.questionId).toBe(first!.questionId); // cached, not regenerated
  });

  it("returns null for a continuation that is not a new question", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime();
    const engine = new LiveGuidanceEngine({
      runtime,
      detector: new QuestionBoundaryDetector(),
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await runtime.startSession(session.sessionId);

    const result = await engine.produceGuidance({
      sessionId: session.sessionId,
      questionText: "Yes, that is correct.",
      previousQuestion: "Do you use runbooks?",
    });

    expect(result).toBeNull();
  });

  it("supports cancellation", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime = makeRuntime();
    const engine = new LiveGuidanceEngine({
      runtime,
      detector: new QuestionBoundaryDetector(),
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await runtime.startSession(session.sessionId);

    const ac = new AbortController();
    ac.abort();
    await expect(
      engine.produceGuidance({
        sessionId: session.sessionId,
        questionText: "Tell me about your experience.",
        signal: ac.signal,
      }),
    ).rejects.toThrow();
  });
});
