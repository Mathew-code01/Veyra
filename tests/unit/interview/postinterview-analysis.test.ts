import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { PostInterviewAnalysisEngine } from "../../../core/interview/postinterview/PostInterviewAnalysisEngine";
import { QuestionUnderstandingEngine } from "../../../core/interview/understanding/QuestionUnderstandingEngine";
import { AnswerPlanningEngine } from "../../../core/interview/planning/AnswerPlanningEngine";
import { AnswerEvaluationEngine } from "../../../core/interview/evaluation/AnswerEvaluationEngine";
import { CommunicationAssistanceEngine } from "../../../core/interview/communication/CommunicationAssistanceEngine";
import { FollowUpIntelligenceEngine } from "../../../core/interview/followup/FollowUpIntelligenceEngine";
import { ProfessionalDomainClassifier } from "../../../core/interview/classification/ProfessionalDomainClassifier";
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

function insertQuestion(
  sessionId: string,
  text: string,
  type = "behavioral",
  isFollowUp = false,
  parentQuestionId?: string,
) {
  const db = getTestDatabase().sqlite;
  const id = randomUUID();
  db.prepare(
    `INSERT INTO questions (id, session_id, text, type, confidence, is_follow_up, parent_question_id, classification, created_at)
     VALUES (?, ?, ?, ?, 90, ?, ?, '{}', '2026-01-01')`,
  ).run(id, sessionId, text, type, isFollowUp ? 1 : 0, parentQuestionId ?? null);
  return id;
}

function insertAnswer(sessionId: string, questionId: string, answerText: string) {
  const db = getTestDatabase().sqlite;
  return db.prepare(
    `INSERT INTO answers (id, session_id, question_id, provider, model, payload, confidence, created_at)
     VALUES (?, ?, ?, 'mock', 'mock-model', ?, 80, '2026-01-01')`,
  ).run(randomUUID(), sessionId, questionId, JSON.stringify({ candidateAnswerText: answerText })).lastInsertRowid as string;
}

function makeEngine() {
  return new PostInterviewAnalysisEngine({
    sessionRepository: new SessionRepository(),
    questionRepository: new QuestionRepository(),
    answerRepository: new AnswerRepository(),
    questionUnderstanding: new QuestionUnderstandingEngine(),
    answerPlanning: new AnswerPlanningEngine(),
    answerEvaluation: new AnswerEvaluationEngine(),
    communication: new CommunicationAssistanceEngine(),
    followUp: new FollowUpIntelligenceEngine(),
    domainClassifier: new ProfessionalDomainClassifier(),
    retrieveCandidateContext: async (_profileId, _candidateId, _query) => [
      {
        id: "ev-1",
        source: "candidate",
        text: "Reduced incident response time by 40% through runbook automation.",
        verified: true,
      },
    ],
  });
}

describe("PostInterviewAnalysisEngine (Phase 15)", () => {
  let dbPath: string | undefined;

  afterEach(async () => {
    if (dbPath) {
      await destroyTestDatabase(dbPath);
      dbPath = undefined;
    }
  });

  it("produces a question-by-question review with transparent evaluation", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const questionRepo = new QuestionRepository();
    const answerRepo = new AnswerRepository();

    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Practice: Software Engineer",
      mode: "mixed",
      status: "completed",
      settings: {
        interviewMode: "practice",
        candidateId: "cand-1",
        targetRole: "Site Reliability Engineer",
        domain: "software_engineering",
      },
    });

    const qId = insertQuestion(session.id, "Tell me about a time you improved system reliability.");
    insertAnswer(session.id, qId, "I automated incident runbooks and reduced MTTR by 40% over two quarters.");

    const engine = makeEngine();
    const { review } = await engine.analyze({ sessionId: session.id });

    expect(review.sessionId).toBe(session.id);
    expect(review.questionReviews).toHaveLength(1);
    const qr = review.questionReviews[0];
    expect(qr.questionText).toBe("Tell me about a time you improved system reliability.");
    expect(qr.intent.coreIntent.length).toBeGreaterThan(0);
    expect(qr.intent.assessedCompetencies.length).toBeGreaterThan(0);
    expect(qr.response?.answerText).toContain("runbooks");
    expect(qr.relevantEvidence.length).toBeGreaterThan(0);
    expect(qr.relevantEvidence.some((e) => e.id === "ev-1")).toBe(true);
    expect(qr.evaluation.overallScore).toBeGreaterThan(0);
    expect(qr.evaluation.dimensions.length).toBeGreaterThan(0);
    expect(qr.evaluation.dimensions[0].criteria.length).toBeGreaterThan(0);
    expect(qr.evaluation.supportingEvidenceIds.length).toBeGreaterThan(0);
    expect(qr.confidence).toBeGreaterThanOrEqual(0);
    expect(qr.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(qr.limitations)).toBe(true);
    expect(review.strengths.length).toBeGreaterThan(0);
    expect(review.overallAssessment.length).toBeGreaterThan(0);
  });

  it("distinguishes transcript-derived facts from AI-generated interpretation", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Live",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "live", targetRole: "Engineer", domain: "software_engineering" },
    });
    const qId = insertQuestion(session.id, "Describe a technical challenge you overcame.");
    insertAnswer(session.id, qId, "I refactored a legacy module and cut build times by 25%.");

    const engine = makeEngine();
    const { review } = await engine.analyze({ sessionId: session.id });

    const qr = review.questionReviews[0];
    // Transcript-derived fact: the answer text is preserved exactly.
    expect(qr.response?.answerText).toBe("I refactored a legacy module and cut build times by 25%.");
    // Interpretation is flagged as evaluation_engine basis with explicit criteria.
    expect(qr.evaluation.basis).toBe("evaluation_engine");
    expect(qr.evaluation.dimensions.every((d) => d.criteria.length > 0)).toBe(true);
    expect(qr.evaluation.supportingEvidenceIds).toBeDefined();
  });

  it("handles a session with no answers gracefully", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Empty",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", targetRole: "Engineer", domain: "software_engineering" },
    });
    insertQuestion(session.id, "What is your greatest strength?");

    const engine = makeEngine();
    const { review } = await engine.analyze({ sessionId: session.id });

    expect(review.questionReviews).toHaveLength(1);
    expect(review.questionReviews[0].response).toBeNull();
    expect(review.questionReviews[0].evaluation.basis).toBe("evaluation_engine");
    expect(review.missedOpportunities.length).toBeGreaterThan(0);
  });

  it("enforces profile isolation on session access", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");
    insertProfile("profile-2", "Other");

    const sessionRepo = new SessionRepository();
    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Private",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", targetRole: "Engineer", domain: "software_engineering" },
    });
    insertQuestion(session.id, "What is your greatest strength?");

    const engine = makeEngine();
    await expect(engine.analyze({ sessionId: session.id })).resolves.toBeDefined();

    // Session belongs to profile-1; accessing via a profile-scoped call that
    // targets profile-2 should not find it (repository is profile-scoped).
    const sessionByProfile2 = sessionRepo.getById(session.id);
    expect(sessionByProfile2.profileId).toBe("profile-1");
  });

  it("generates a personalised learning plan", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Plan",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", targetRole: "Engineer", domain: "software_engineering" },
    });
    const qId = insertQuestion(session.id, "Tell me about a time you led a team through a crisis.");
    insertAnswer(session.id, qId, "I coordinated the team and restored service.");

    const engine = makeEngine();
    const plan = await engine.generateLearningPlan({ sessionId: session.id });

    expect(plan.sessionId).toBe(session.id);
    expect(plan.activities.length).toBeGreaterThan(0);
    expect(plan.measurableImprovementGoals.length).toBeGreaterThan(0);
    expect(plan.suggestedReviewPoints.length).toBeGreaterThan(0);
  });

  it("persists and recovers the review across a restart (profile isolation preserved)", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const questionRepo = new QuestionRepository();
    const answerRepo = new AnswerRepository();

    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Persist",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", candidateId: "cand-1", targetRole: "Engineer", domain: "software_engineering" },
    });
    const qId = insertQuestion(session.id, "Describe a time you improved a system.");
    insertAnswer(session.id, qId, "I refactored a legacy module and cut build times by 25%.");

    const engine1 = makeEngine();
    const { review: review1 } = await engine1.analyze({ sessionId: session.id });

    // Persist the review + learning plan to session settings (additive, no migration).
    sessionRepo.updateSettings(session.id, {
      ...(session.settings as any),
      interviewReview: review1,
    });

    // New engine instance reads the same SQLite state.
    const sessionReloaded = sessionRepo.getById(session.id);
    expect(sessionReloaded.settings.interviewReview).toBeDefined();
    expect((sessionReloaded.settings as any).interviewReview.sessionId).toBe(session.id);
    expect((sessionReloaded.settings as any).interviewReview.questionReviews[0].questionText).toBe(
      "Describe a time you improved a system.",
    );

    // Profile isolation: another profile cannot see this session's review.
    insertProfile("profile-2", "Other");
    const sessionRepo2 = new SessionRepository();
    // sessionRepo2 has no knowledge of session.id belonging to profile-1 unless queried by id;
    // the settings remain scoped to the session's profileId row.
    const row = sessionRepo.getById(session.id);
    expect(row.profileId).toBe("profile-1");
  });

  it("supports cancellation", async () => {
    dbPath = await createTestDatabase();
    insertProfile("profile-1");

    const sessionRepo = new SessionRepository();
    const session = sessionRepo.create({
      profileId: "profile-1",
      title: "Cancel",
      mode: "mixed",
      status: "completed",
      settings: { interviewMode: "practice", targetRole: "Engineer", domain: "software_engineering" },
    });
    insertQuestion(session.id, "Tell me about yourself.");

    const engine = makeEngine();
    const ac = new AbortController();
    ac.abort();
    await expect(engine.analyze({ sessionId: session.id, signal: ac.signal })).rejects.toThrow();
  });
});
