import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import { UnifiedInterviewRuntime } from "../../../core/interview/runtime/UnifiedInterviewRuntime";
import { PracticeSessionEngine } from "../../../core/interview/practice/PracticeSessionEngine";
import { SessionRepository } from "../../../database/repositories/sessionRepository";
import { QuestionRepository } from "../../../database/repositories/questionRepository";
import { AnswerRepository } from "../../../database/repositories/answerRepository";
import { MemoryRepository } from "../../../database/repositories/memoryRepository";
import { createTestDatabase, destroyTestDatabase, getTestDatabase } from "../../helpers/database";

function insertProfile(id = "profile-1", name = "Test Profile") {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
     VALUES (?, ?, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, name);
}

describe("Phase 12 integration (injected adapters)", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("practice flow persists, supports profile isolation, and recovers after restart (mock AI/context)", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");
    insertProfile("profile-2", "Other");

    const sessionRepo = new SessionRepository();
    const questionRepo = new QuestionRepository();
    const answerRepo = new AnswerRepository();
    const memoryRepo = new MemoryRepository();

    const mockAI = {
      generate: vi.fn(async (_provider: string, request: any) => ({
        type: "text_generation",
        text: "Grounded suggestion: highlight measurable impact from verified experience.",
        metadata: { provider: "mock-local", model: "mock-1", requestId: request.requestId, latencyMs: 3 },
      })),
    } as any;

    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: sessionRepo,
      questionRepository: questionRepo,
      answerRepository: answerRepo,
      memoryRepository: memoryRepo,
      aiManager: mockAI,
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async (_profileId, _candidateId, _query) => [
        { id: "ev-1", source: "candidate" as const, text: "Reduced incident response time by 40% through runbook automation.", verified: true },
      ],
    });

    const created = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "practice",
      targetRole: "Site Reliability Engineer",
      domain: "software_engineering",
      questionCount: 1,
    });
    await runtime.startSession(created.sessionId);
    const q = await runtime.processQuestion({
      sessionId: created.sessionId,
      text: "Tell me about a time you improved reliability.",
      source: "typed",
      generateAI: true,
      aiRequestId: randomUUID(),
    });
    expect(q.ai?.executed).toBe(true);
    expect(q.provenance.candidateEvidenceIds).toContain("ev-1");

    const a = await runtime.submitAnswer({
      sessionId: created.sessionId,
      questionId: q.questionId!,
      answerText: "I automated incident runbooks and reduced MTTR by 40% over two quarters.",
    });
    expect(a.evaluation.overallScore).toBeGreaterThan(0);
    expect(a.completed).toBe(true);

    // persistence/restart recovery: new instances read same SQLite state
    const runtime2 = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-1",
    });
    const recovered = await runtime2.getState(created.sessionId);
    expect(recovered.sessionId).toBe(created.sessionId);
    expect(recovered.status).toBe("completed");

    // profile isolation
    const runtimeOther = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-2",
    });
    await expect(runtimeOther.getState(created.sessionId)).rejects.toThrow(/profile/i);
  });

  it("cloud/AI denial is surfaced without fallback and BYOK secrets never passed to runtime AI call", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const aiManager = {
      generate: vi.fn(async (_provider: string, request: any) => {
        const serialized = JSON.stringify(request ?? {}).toLowerCase();
        expect(serialized).not.toContain("byok");
        expect(serialized).not.toContain("api_key");
        expect(serialized).not.toContain("secret");
        throw new Error("Cloud execution denied: consent or entitlement missing.");
      }),
    } as any;

    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      aiManager,
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });

    const s = await runtime.createSession({ profileId: "profile-1", mode: "live", targetRole: "Manager" });
    await runtime.startSession(s.sessionId);
    const res = await runtime.processQuestion({
      sessionId: s.sessionId,
      text: "How would you handle a conflict in your team?",
      source: "typed",
      generateAI: true,
      aiProvider: "cloud",
    });
    expect(res.ai?.executed).toBe(false);
    expect((res.ai?.unavailableReason ?? "").toLowerCase()).toContain("denied");
    expect(res.provenance.factsGrounded).toBe(false);
  });

  it("injected transcript source (simulated audio) feeds runtime analysis without raw audio", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");
    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-1",
    });
    const s = await runtime.createSession({ profileId: "profile-1", mode: "live", targetRole: "Nurse" });
    await runtime.startSession(s.sessionId);
    // simulate transcription adapter output only (no mic/hardware)
    const transcriptText = "Can you describe how you prioritize patients during triage?";
    const res = await runtime.processQuestion({ sessionId: s.sessionId, text: transcriptText, source: "voice_transcript" });
    expect(res.source).toBe("voice_transcript");
    expect(res.questionText).toBe(transcriptText);
    expect(res.questionId).toBeTruthy();
    expect(res.understanding.coreIntent.length).toBeGreaterThan(0);
  });

  it("practice engine baseline remains functional (regression)", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");
    const engine = new PracticeSessionEngine(new SessionRepository(), new QuestionRepository(), new AnswerRepository());
    const session = await engine.createSession({ profileId: "profile-1", targetRole: "Software Engineer", questionCount: 1 });
    expect(session.id).toBeTruthy();
    const state = await engine.getSessionState(session.id);
    expect(state?.status).toBeDefined();
  });
});
