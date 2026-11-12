import { afterEach, describe, expect, it } from "vitest";

import { SessionRepository } from "../../../database/repositories/sessionRepository";
import { QuestionRepository } from "../../../database/repositories/questionRepository";
import { AnswerRepository } from "../../../database/repositories/answerRepository";
import { PracticeSessionEngine } from "../../../core/interview/practice/PracticeSessionEngine";
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

describe("PracticeSessionEngine end-to-end workflow", () => {
  let databasePath: string | undefined;

  afterEach(async () => {
    if (databasePath) {
      await destroyTestDatabase(databasePath);
      databasePath = undefined;
    }
  });

  it("creates, starts, answers, completes, and reloads a practice session", async () => {
    databasePath = await createTestDatabase();
    const db = getTestDatabase().sqlite;

    // Insert a profile for foreign key satisfaction
    db.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES ('profile-1', 'Test Profile', '{}', '2026-01-01', '2026-01-01')`,
    ).run();

    const sessionRepo = new SessionRepository();
    const questionRepo = new QuestionRepository();
    const answerRepo = new AnswerRepository();
    const engine = new PracticeSessionEngine(sessionRepo, questionRepo, answerRepo);

    // 1. Create session
    const created = await engine.createSession({
      profileId: "profile-1",
      targetRole: "Senior Software Engineer",
      domain: "software_engineering",
      experienceLevel: "senior",
      difficulty: "intermediate",
      questionCount: 3,
    });

    expect(created.profileId).toBe("profile-1");
    expect(created.targetRole).toBe("Senior Software Engineer");
    expect(created.domain).toBe("software_engineering");
    expect(created.status).toBe("draft");
    expect(created.questionCount).toBe(3);
    expect(created.id).toBeDefined();

    // 2. Start session (generates opening question)
    const started = await engine.startSession(created.id);
    expect(started.status).toBe("active");
    expect(started.currentQuestion).toBeDefined();
    expect(started.currentQuestion?.text).toContain("Senior Software Engineer");
    expect(started.currentQuestion?.isFollowUp).toBe(false);

    // 3. Submit answer to opening question
    const answerResult = await engine.submitAnswer(
      created.id,
      started.currentQuestion!.id,
      "I designed a microservices architecture using Docker and Kubernetes, reducing deployment time by 40% and handling 10k requests per second.",
    );

    expect(answerResult.answerId).toBeDefined();
    expect(answerResult.questionId).toBe(started.currentQuestion!.id);
    expect(answerResult.evaluation.overallScore).toBeGreaterThan(0);
    expect(answerResult.evaluation.dimensions.evidenceGrounding.score).toBeGreaterThan(70);
    expect(answerResult.communicationFeedback.overallRating).toBeDefined();
    expect(answerResult.followUps.length).toBeGreaterThan(0);
    expect(answerResult.followUps.some((f) => f.type === "numerical_detail")).toBe(false); // has numbers
    expect(answerResult.isSessionCompleted).toBe(false);

    // 4. Get next question (adaptive)
    const nextQ = await engine.nextQuestion(created.id);
    expect(nextQ).toBeDefined();
    expect(nextQ?.sessionId).toBe(created.id);
    expect(nextQ?.isFollowUp).toBe(false);

    // 5. Submit answer to second question
    await engine.submitAnswer(
      created.id,
      nextQ!.id,
      "I resolve conflicts by listening to all parties, identifying root causes, and finding win-win solutions.",
    );

    // 6. Submit answer to third question (completes session)
    const thirdQ = await engine.nextQuestion(created.id);
    expect(thirdQ).toBeDefined();

    const finalResult = await engine.submitAnswer(
      created.id,
      thirdQ!.id,
      "I led a team of 5 engineers to migrate our monolith to React TypeScript, improving page load speed by 60%.",
    );

    expect(finalResult.isSessionCompleted).toBe(true);

    // 7. Get session state (should show completed)
    const state = await engine.getSessionState(created.id);
    expect(state.status).toBe("completed");
    expect(state.questionsAnswered).toBe(3);
    expect(state.report).toBeDefined();
    expect(state.report!.overallScore).toBeGreaterThan(0);
    expect(state.report!.strengths.length).toBeGreaterThan(0);
    expect(state.report!.weaknesses.length).toBeGreaterThan(0);

    // 8. List sessions for profile
    const sessions = await engine.listSessions("profile-1");
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(created.id);
    expect(sessions[0].status).toBe("completed");

    // 9. Profile isolation - other profile sees no sessions
    const otherSessions = await engine.listSessions("profile-2");
    expect(otherSessions.length).toBe(0);
  });

  it("pauses and resumes a practice session", async () => {
    databasePath = await createTestDatabase();
    const db = getTestDatabase().sqlite;

    db.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES ('profile-1', 'Test Profile', '{}', '2026-01-01', '2026-01-01')`,
    ).run();

    const engine = new PracticeSessionEngine(
      new SessionRepository(),
      new QuestionRepository(),
      new AnswerRepository(),
    );

    const created = await engine.createSession({
      profileId: "profile-1",
      targetRole: "Product Manager",
      domain: "business_and_management",
      questionCount: 3,
    });

    const started = await engine.startSession(created.id);

    // Pause
    const paused = await engine.pauseSession(created.id);
    expect(paused.status).toBe("paused");

    // Resume
    const resumed = await engine.resumeSession(created.id);
    expect(resumed.status).toBe("active");
    expect(resumed.currentQuestion?.id).toBe(started.currentQuestion?.id);
  });

  it("follow-up questions use the previous answer context", async () => {
    databasePath = await createTestDatabase();
    const db = getTestDatabase().sqlite;

    db.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES ('profile-1', 'Test Profile', '{}', '2026-01-01', '2026-01-01')`,
    ).run();

    const engine = new PracticeSessionEngine(
      new SessionRepository(),
      new QuestionRepository(),
      new AnswerRepository(),
    );

    const created = await engine.createSession({
      profileId: "profile-1",
      targetRole: "Customer Success Manager",
      domain: "customer_service",
      questionCount: 3,
    });

    const started = await engine.startSession(created.id);

    // Submit an answer without numbers - should trigger numerical_detail follow-up
    const result = await engine.submitAnswer(
      created.id,
      started.currentQuestion!.id,
      "I helped a customer with their billing issue and they were happy.",
    );

    expect(result.followUps.length).toBeGreaterThan(0);
    expect(
      result.followUps.some((f) => f.type === "numerical_detail"),
    ).toBe(true);

    // Follow-up should reference the previous answer
    const numericalFollowUp = result.followUps.find(
      (f) => f.type === "numerical_detail",
    );
    expect(numericalFollowUp?.relevantPreviousAnswerExcerpt).toContain(
      "billing issue",
    );
  });

  it("session creation fails without profile", async () => {
    databasePath = await createTestDatabase();
    const db = getTestDatabase().sqlite;

    db.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES ('profile-1', 'Test Profile', '{}', '2026-01-01', '2026-01-01')`,
    ).run();

    const engine = new PracticeSessionEngine(
      new SessionRepository(),
      new QuestionRepository(),
      new AnswerRepository(),
    );

    await expect(
      engine.createSession({
        profileId: "nonexistent-profile",
        targetRole: "Engineer",
      }),
    ).rejects.toThrow();
  });
});
