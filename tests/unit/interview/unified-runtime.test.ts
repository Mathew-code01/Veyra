import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { UnifiedInterviewRuntime } from "../../../core/interview/runtime/UnifiedInterviewRuntime";
import { InterviewIntelligence } from "../../../core/interview/services/InterviewIntelligence";
import { SessionRepository } from "../../../database/repositories/sessionRepository";
import { QuestionRepository } from "../../../database/repositories/questionRepository";
import { AnswerRepository } from "../../../database/repositories/answerRepository";
import { MemoryRepository } from "../../../database/repositories/memoryRepository";
import type { AIManager } from "../../../core/ai/AIManager";
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

function insertProfile(id = "profile-1", name = "Test Profile") {
  const db = getTestDatabase().sqlite;
  db.prepare(
    `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
     VALUES (?, ?, '{}', '2026-01-01', '2026-01-01')`,
  ).run(id, name);
}

function makeMockAiManager(overrides?: Partial<{ generate: any }>): AIManager {
  return {
    generate: overrides?.generate ?? (async (_provider: string, request: any) => ({
      type: "text_generation",
      text: "Grounded guidance: state context, action, measurable result.",
      metadata: { provider: "mock", model: "mock-model", requestId: request.requestId, latencyMs: 5 },
    })),
  } as unknown as AIManager;
}

describe("UnifiedInterviewRuntime (Phase 9)", () => {
  let databasePath: string | undefined;

  afterEach(async () => {
    if (databasePath) {
      await destroyTestDatabase(databasePath);
      databasePath = undefined;
    }
  });

  it("creates, starts, processes typed question, submits answer, persists and recovers practice session", async () => {
    databasePath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const questionRepo = new QuestionRepository();
    const answerRepo = new AnswerRepository();
    const memoryRepo = new MemoryRepository();
    const intelligence = new InterviewIntelligence();

    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: intelligence,
      sessionRepository: sessionRepo,
      questionRepository: questionRepo,
      answerRepository: answerRepo,
      memoryRepository: memoryRepo,
      aiManager: makeMockAiManager(),
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async (_profileId, _candidateId, _query) => [
        { id: "cand-ev-1", source: "candidate" as const, text: "Led migration reducing latency by 30%.", verified: true },
      ],
    });

    const created = await runtime.createSession({
      profileId: "profile-1",
      candidateId: "cand-1",
      mode: "practice",
      targetRole: "Software Engineer",
      domain: "software_engineering",
      questionCount: 2,
    });
    expect(created.status).toBe("draft");
    expect(created.mode).toBe("practice");

    const started = await runtime.startSession(created.sessionId);
    expect(started.status).toBe("active");

    const q = await runtime.processQuestion({
      sessionId: created.sessionId,
      text: "Tell me about a time you improved system performance.",
      source: "typed",
      generateAI: true,
      aiRequestId: randomUUID(),
    });

    expect(q.questionId).toBeTruthy();
    expect(q.domain.primaryDomain).toBeDefined();
    expect(q.understanding.coreIntent.length).toBeGreaterThan(0);
    expect(q.evidence.some((e) => e.id === "cand-ev-1")).toBe(true);
    expect(q.provenance.candidateEvidenceIds).toContain("cand-ev-1");
    expect(q.provenance.factsGrounded).toBe(true);
    expect(q.ai?.executed).toBe(true);
    expect((q.ai?.text ?? "").length).toBeGreaterThan(0);

    const a1 = await runtime.submitAnswer({
      sessionId: created.sessionId,
      questionId: q.questionId!,
      answerText: "I optimized database queries and caching, reducing p95 latency by 30%.",
      source: "practice_answer",
    });
    expect(a1.answerId).toBeTruthy();
    expect(a1.evaluation.overallScore).toBeGreaterThan(0);
    expect(a1.communication.overallRating).toBeDefined();
    expect(a1.followUps.length).toBeGreaterThanOrEqual(0);

    // Persistence/recovery: new runtime instance can reload session state
    const runtime2 = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-1",
    });
    const recovered = await runtime2.getState(created.sessionId);
    expect(recovered.sessionId).toBe(created.sessionId);
    expect(recovered.profileId).toBe("profile-1");
    expect(recovered.mode).toBe("practice");
  });

  it("supports pause, resume, cancellation and enforces profile isolation", async () => {
    databasePath = await createTestDatabase();
    insertProfile("profile-1");
    insertProfile("profile-2", "Other");

    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-1",
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      mode: "live",
      targetRole: "Product Manager",
    });
    await runtime.startSession(session.sessionId);

    const paused = await runtime.pauseSession(session.sessionId);
    expect(paused.status).toBe("paused");
    await expect(runtime.processQuestion({
      sessionId: session.sessionId,
      text: "What is your strategy?",
      source: "voice_transcript",
    })).rejects.toThrow(/paused/i);

    const resumed = await runtime.resumeSession(session.sessionId);
    expect(resumed.status).toBe("active");

    const cancelled = await runtime.cancelSession(session.sessionId, "User stopped");
    expect(cancelled.status).toBe("failed");

    const runtimeOther = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-2",
    });
    await expect(runtimeOther.getState(session.sessionId)).rejects.toThrow(/profile/i);
  });

  it("handles missing evidence and AI failure/timeout without fabricating facts", async () => {
    databasePath = await createTestDatabase();
    insertProfile("profile-1");

    const failingAi = makeMockAiManager({
      generate: async () => { throw new Error("Provider timeout"); },
    });

    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      aiManager: failingAi,
      resolveProfileId: () => "profile-1",
      retrieveCandidateContext: async () => [],
    });

    const session = await runtime.createSession({
      profileId: "profile-1",
      mode: "practice",
      targetRole: "Analyst",
      questionCount: 1,
    });
    await runtime.startSession(session.sessionId);

    const res = await runtime.processQuestion({
      sessionId: session.sessionId,
      text: "Describe a complex analysis you delivered.",
      source: "typed",
      generateAI: true,
    });

    expect(res.evidence.length).toBe(0);
    expect(res.provenance.factsGrounded).toBe(false);
    expect(res.provenance.assumptions.length).toBeGreaterThan(0);
    expect(res.ai?.executed).toBe(false);
    expect((res.ai?.unavailableReason ?? "").toLowerCase()).toContain("timeout");
  });

  it("respects cancellation signal", async () => {
    databasePath = await createTestDatabase();
    insertProfile("profile-1");
    const runtime = new UnifiedInterviewRuntime({
      interviewIntelligence: new InterviewIntelligence(),
      sessionRepository: new SessionRepository(),
      questionRepository: new QuestionRepository(),
      answerRepository: new AnswerRepository(),
      resolveProfileId: () => "profile-1",
    });
    const session = await runtime.createSession({ profileId: "profile-1", mode: "live", targetRole: "Nurse" });
    await runtime.startSession(session.sessionId);
    const ac = new AbortController();
    ac.abort();
    await expect(runtime.processQuestion({
      sessionId: session.sessionId,
      text: "How do you handle triage?",
      source: "voice_transcript",
      signal: ac.signal,
    })).rejects.toThrow();
  });
});
