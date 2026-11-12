import { afterEach, describe, expect, it } from "vitest";

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
      { id: "ev-1", source: "candidate", text: "Reduced p95 latency by 30% through query and caching optimization.", verified: true },
    ],
  });
}

describe("Live audio-to-guidance recovery and reliability (simulated transcript)", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("progresses from simulated transcript text through question detection, evidence retrieval, guidance and persisted state", async () => {
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
      questionText: "Tell me about a time you improved system reliability.",
    });

    expect(guidance).not.toBeNull();
    expect(guidance!.questionId).toBeTruthy();
    expect(guidance!.evidence.some((e) => e.id === "ev-1")).toBe(true);

    const state = await runtime.getState(session.sessionId);
    expect(state.sessionId).toBe(session.sessionId);
    expect(state.lastQuestionId).toBe(guidance!.questionId);
    expect(state.lastGuidance).toBeDefined();
    expect(state.lastGuidance!.questionText).toBe("Tell me about a time you improved system reliability.");
  });

  it("recovers guidance and session state after a runtime restart", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const runtime1 = makeRuntime();
    const engine1 = new LiveGuidanceEngine({
      runtime: runtime1,
      detector: new QuestionBoundaryDetector(),
    });

    const session = await runtime1.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await runtime1.startSession(session.sessionId);

    const guidance1 = await engine1.produceGuidance({
      sessionId: session.sessionId,
      questionText: "How do you handle an on-call incident?",
    });
    expect(guidance1).not.toBeNull();

    const runtime2 = makeRuntime();
    const engine2 = new LiveGuidanceEngine({
      runtime: runtime2,
      detector: new QuestionBoundaryDetector(),
    });

    const recovered = await runtime2.getState(session.sessionId);
    expect(recovered.sessionId).toBe(session.sessionId);
    expect(recovered.lastGuidance).toBeDefined();
    expect(recovered.lastGuidance!.questionText).toBe("How do you handle an on-call incident?");
    expect(recovered.lastGuidance!.evidence.some((e) => e.id === "ev-1")).toBe(true);
  });

  it("suppresses duplicate transcript text (duplicate suppression)", async () => {
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
      questionText: "What is your approach to root-cause analysis?",
    });
    const second = await engine.produceGuidance({
      sessionId: session.sessionId,
      questionText: "What is your approach to root-cause analysis?",
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.questionId).toBe(first!.questionId);
  });

  it("handles missing evidence without fabricating facts", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const noEvidenceRuntime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });
    const engine = new LiveGuidanceEngine({
      runtime: noEvidenceRuntime,
      detector: new QuestionBoundaryDetector(),
    });

    const session = await noEvidenceRuntime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "live",
      targetRole: "Engineer",
      domain: "software_engineering",
    });
    await noEvidenceRuntime.startSession(session.sessionId);

    const guidance = await engine.produceGuidance({
      sessionId: session.sessionId,
      questionText: "Describe a time you improved a system.",
    });

    expect(guidance).not.toBeNull();

    expect(guidance!.evidence.length).toBe(0);
    expect(guidance!.assumptions.length).toBeGreaterThan(0);
  });

  it("supports cancellation of in-flight guidance", async () => {
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
        questionText: "Tell me about your background.",
        signal: ac.signal,
      }),
    ).rejects.toThrow();
  });
});
