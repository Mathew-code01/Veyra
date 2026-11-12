// ============================================================================
// FILE: core/interview/practice/PracticeSessionEngine.ts
//
// PURPOSE:
// Complete practice and mock interview session orchestration engine.
// Coordinates session lifecycle, adaptive questioning, evaluation,
// follow-up relationships, persistence across restarts, and end-of-session reports.
// ============================================================================

import type { SessionRepository } from "../../../database/repositories/sessionRepository";
import type { QuestionRepository } from "../../../database/repositories/questionRepository";
import type { AnswerRepository } from "../../../database/repositories/answerRepository";
import type { PracticeSessionReport, SessionMode, SessionStatus } from "../../../database/schema/sessions";
import type {
  AnswerEvaluation,
  CommunicationFeedback,
  FollowUpQuestion,
  InterviewDomain,
  QuestionUnderstanding,
} from "../../../shared/types/interviews";
import { QuestionUnderstandingEngine } from "../understanding/QuestionUnderstandingEngine";
import { AnswerEvaluationEngine } from "../evaluation/AnswerEvaluationEngine";
import { CommunicationAssistanceEngine } from "../communication/CommunicationAssistanceEngine";
import { FollowUpIntelligenceEngine } from "../followup/FollowUpIntelligenceEngine";
import { ProfessionalDomainClassifier } from "../classification/ProfessionalDomainClassifier";

export interface PracticeSessionConfig {
  readonly profileId: string;
  readonly title?: string;
  readonly targetRole: string;
  readonly jobDescription?: string;
  readonly domain?: InterviewDomain;
  readonly interviewType?: SessionMode;
  readonly experienceLevel?: "entry" | "mid" | "senior" | "lead" | "executive";
  readonly difficulty?: "beginner" | "intermediate" | "advanced";
  readonly questionCount?: number;
}

export interface PracticeQuestionView {
  readonly id: string;
  readonly sessionId: string;
  readonly text: string;
  readonly type: string;
  readonly isFollowUp: boolean;
  readonly parentQuestionId?: string | null;
  readonly sequenceNumber: number;
}

export interface PracticeAnswerResult {
  readonly answerId: string;
  readonly questionId: string;
  readonly evaluation: AnswerEvaluation;
  readonly communicationFeedback: CommunicationFeedback;
  readonly followUps: readonly FollowUpQuestion[];
  readonly isSessionCompleted: boolean;
}

export interface PracticeSessionState {
  readonly id: string;
  readonly profileId: string;
  readonly title: string | null;
  readonly status: SessionStatus;
  readonly targetRole?: string;
  readonly domain?: string;
  readonly questionCount: number;
  readonly questionsAnswered: number;
  readonly currentQuestion?: PracticeQuestionView;
  readonly report?: PracticeSessionReport;
}

export class PracticeSessionEngine {
  private readonly questionUnderstanding = new QuestionUnderstandingEngine();
  private readonly answerEvaluator = new AnswerEvaluationEngine();
  private readonly commsEngine = new CommunicationAssistanceEngine();
  private readonly followUpEngine = new FollowUpIntelligenceEngine();
  private readonly domainClassifier = new ProfessionalDomainClassifier();

  public constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly questionRepo: QuestionRepository,
    private readonly answerRepo: AnswerRepository,
  ) {}

  public async createSession(config: PracticeSessionConfig): Promise<PracticeSessionState> {
    const domain = config.domain ?? (config.targetRole ? this.domainClassifier.classify(config.targetRole).primaryDomain : "general_employment");
    const mode = config.interviewType ?? "mixed";
    const questionCount = Math.min(20, Math.max(3, config.questionCount ?? 5));
    const title = config.title ?? `Mock Interview: ${config.targetRole}`;

    const session = this.sessionRepo.create({
      profileId: config.profileId,
      title,
      mode,
      status: "draft",
      settings: {
        targetRole: config.targetRole,
        jobDescription: config.jobDescription,
        domain,
        difficulty: config.difficulty ?? "intermediate",
        experienceLevel: config.experienceLevel ?? "mid",
        questionCount,
      },
    });

    if (!session) {
      throw new Error("Failed to persist practice session.");
    }

    return this.mapSessionState(session.id);
  }

  public async startSession(sessionId: string): Promise<PracticeSessionState> {
    const session = this.sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    if (session.status === "draft") {
      this.sessionRepo.updateStatus(sessionId, "active");
    }

    // Check if questions exist; if not, generate the opening question
    const existingQuestions = this.questionRepo.listBySession(sessionId);
    if (existingQuestions.length === 0) {
      const openingQuestionText = this.generateOpeningQuestion(
        session.settings.targetRole ?? "Professional",
        (session.settings.domain as InterviewDomain) ?? "general_employment",
        session.settings.experienceLevel ?? "mid",
      );

      this.questionRepo.create({
        sessionId,
        text: openingQuestionText,
        type: session.mode === "mixed" ? "behavioral" : (session.mode as any),
        confidence: 90,
        isFollowUp: false,
        classification: { signals: ["Opening session question"] },
      });
    }

    return this.mapSessionState(sessionId);
  }

  public async submitAnswer(
    sessionId: string,
    questionId: string,
    candidateAnswerText: string,
  ): Promise<PracticeAnswerResult> {
    const session = this.sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);
    const question = this.questionRepo.getById(questionId);
    if (!question) throw new Error(`Question ${questionId} not found.`);

    const domain = (session.settings.domain as InterviewDomain) ?? "general_employment";
    const understanding = this.questionUnderstanding.understand(question.text);
    const evaluation = this.answerEvaluator.evaluate({
      answerText: candidateAnswerText,
      questionUnderstanding: understanding,
      domain,
      targetRole: session.settings.targetRole,
    });
    const communicationFeedback = this.commsEngine.analyze(candidateAnswerText);
    const followUps = this.followUpEngine.generateFollowUps(candidateAnswerText, understanding, domain);

    const answer = this.answerRepo.create({
      sessionId,
      questionId,
      confidence: evaluation.overallScore,
      payload: {
        candidateAnswerText,
        headline: understanding.coreIntent,
        talkingPoints: [...understanding.assessedCompetencies],
        evaluation,
        communicationFeedback,
      },
    });

    if (!answer) throw new Error("Failed to persist candidate answer.");

    // Check if we should insert a follow-up question
    const allAnswers = this.answerRepo.listBySession(sessionId);
    const maxQuestions = session.settings.questionCount ?? 5;

    let shouldInjectFollowUp = false;
    if (followUps.length > 0 && !question.isFollowUp && allAnswers.length < maxQuestions) {
      // If candidate's answer was missing metrics or lacked clarity, insert top follow-up
      if (evaluation.dimensions.evidenceGrounding.score < 70 || evaluation.dimensions.clarity.score < 70) {
        shouldInjectFollowUp = true;
        this.questionRepo.create({
          sessionId,
          text: followUps[0].questionText,
          type: question.type,
          confidence: 85,
          isFollowUp: true,
          parentQuestionId: questionId,
          classification: { signals: [followUps[0].rationale] },
        });
      }
    }

    // Check if completed
    const currentQuestions = this.questionRepo.listBySession(sessionId);
    const isSessionCompleted = allAnswers.length >= maxQuestions;

    if (isSessionCompleted) {
      await this.completeSession(sessionId);
    } else if (!shouldInjectFollowUp && currentQuestions.length <= allAnswers.length) {
      // Generate next adaptive question
      this.generateNextAdaptiveQuestion(session, currentQuestions, allAnswers);
    }

    return {
      answerId: answer.id,
      questionId,
      evaluation,
      communicationFeedback,
      followUps,
      isSessionCompleted,
    };
  }

  public async nextQuestion(sessionId: string): Promise<PracticeQuestionView | undefined> {
    const session = this.sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    const questions = this.questionRepo.listBySession(sessionId);
    const answers = this.answerRepo.listBySession(sessionId);

    // If there is an unanswered question, return it
    const answeredQuestionIds = new Set(answers.map((a) => a.questionId));
    const nextUnanswered = questions.find((q) => !answeredQuestionIds.has(q.id));

    if (nextUnanswered) {
      const idx = questions.findIndex((q) => q.id === nextUnanswered.id);
      return {
        id: nextUnanswered.id,
        sessionId: nextUnanswered.sessionId,
        text: nextUnanswered.text,
        type: nextUnanswered.type,
        isFollowUp: Boolean(nextUnanswered.isFollowUp),
        parentQuestionId: nextUnanswered.parentQuestionId,
        sequenceNumber: idx + 1,
      };
    }

    // Check if session completed
    const maxQuestions = session.settings.questionCount ?? 5;
    if (answers.length >= maxQuestions) {
      await this.completeSession(sessionId);
      return undefined;
    }

    // Generate new question
    const newQuestion = this.generateNextAdaptiveQuestion(session, questions, answers);
    return {
      id: newQuestion.id,
      sessionId: newQuestion.sessionId,
      text: newQuestion.text,
      type: newQuestion.type,
      isFollowUp: Boolean(newQuestion.isFollowUp),
      parentQuestionId: newQuestion.parentQuestionId,
      sequenceNumber: questions.length + 1,
    };
  }

  public async pauseSession(sessionId: string): Promise<PracticeSessionState> {
    this.sessionRepo.updateStatus(sessionId, "paused");
    return this.mapSessionState(sessionId);
  }

  public async resumeSession(sessionId: string): Promise<PracticeSessionState> {
    this.sessionRepo.updateStatus(sessionId, "active");
    return this.mapSessionState(sessionId);
  }

  public async completeSession(sessionId: string): Promise<PracticeSessionReport> {
    const session = this.sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    const questions = this.questionRepo.listBySession(sessionId);
    const answers = this.answerRepo.listBySession(sessionId);

    const report = this.generateSummaryReport(session, questions, answers);

    this.sessionRepo.updateStatus(sessionId, "completed", new Date().toISOString());
    this.sessionRepo.updateSettings(sessionId, {
      ...session.settings,
      summaryReport: report,
    });

    return report;
  }

  public async getSessionState(sessionId: string): Promise<PracticeSessionState> {
    return this.mapSessionState(sessionId);
  }

  public async listSessions(profileId: string): Promise<readonly PracticeSessionState[]> {
    const sessions = this.sessionRepo.listByProfile(profileId);
    return Promise.all(sessions.map((s) => this.mapSessionState(s.id)));
  }

  // --------------------------------------------------------------------------
  // PRIVATE HELPERS
  // --------------------------------------------------------------------------

  private async mapSessionState(sessionId: string): Promise<PracticeSessionState> {
    const session = this.sessionRepo.getById(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found.`);

    const questions = this.questionRepo.listBySession(sessionId);
    const answers = this.answerRepo.listBySession(sessionId);

    const answeredIds = new Set(answers.map((a) => a.questionId));
    const currentQ = questions.find((q) => !answeredIds.has(q.id)) ?? questions[questions.length - 1];

    let currentQuestionView: PracticeQuestionView | undefined;
    if (currentQ) {
      const idx = questions.findIndex((q) => q.id === currentQ.id);
      currentQuestionView = {
        id: currentQ.id,
        sessionId: currentQ.sessionId,
        text: currentQ.text,
        type: currentQ.type,
        isFollowUp: Boolean(currentQ.isFollowUp),
        parentQuestionId: currentQ.parentQuestionId,
        sequenceNumber: idx + 1,
      };
    }

    return {
      id: session.id,
      profileId: session.profileId,
      title: session.title,
      status: session.status,
      targetRole: session.settings.targetRole,
      domain: session.settings.domain,
      questionCount: session.settings.questionCount ?? 5,
      questionsAnswered: answers.length,
      currentQuestion: currentQuestionView,
      report: session.settings.summaryReport,
    };
  }

  private generateOpeningQuestion(targetRole: string, domain: InterviewDomain, level: string): string {
    if (domain === "software_engineering") {
      return `Welcome! To start off our ${targetRole} interview, could you walk me through your technical background and a challenging engineering project you recently led?`;
    }
    if (domain === "finance_and_accounting") {
      return `Welcome! To begin our discussion for the ${targetRole} position, could you walk me through your professional background and experience with financial modeling and reporting?`;
    }
    if (domain === "healthcare_and_clinical") {
      return `Welcome to the interview for the ${targetRole} position. Could you introduce yourself and describe your clinical experience managing complex patient cases?`;
    }
    if (domain === "customer_service" || domain === "sales_and_marketing") {
      return `Welcome! Let's start with a brief overview of your career background and what attracted you to this ${targetRole} opportunity?`;
    }
    return `Welcome to the interview for the ${targetRole} role. Could you walk me through your background and key experiences that make you a strong fit?`;
  }

  private generateNextAdaptiveQuestion(session: any, questions: any[], answers: any[]): any {
    const domain = (session.settings.domain as InterviewDomain) ?? "general_employment";
    const askedTexts = new Set(questions.map((q) => q.text.toLowerCase()));

    // Pool of domain-specific progressive questions
    const questionPool: Array<{ text: string; type: string }> = [
      {
        text: "Tell me about a time you faced unexpected resistance from a colleague or stakeholder. How did you handle it?",
        type: "behavioral",
      },
      {
        text: "How do you prioritize competing deadlines when multiple high-urgency tasks arrive simultaneously?",
        type: "situational",
      },
      {
        text: "Describe a situation where a project you were responsible for encountered a critical error or setback. What were your recovery steps?",
        type: "behavioral",
      },
      {
        text: "What key metrics do you monitor to measure the success and quality of your work?",
        type: "technical",
      },
      {
        text: "Where do you see the biggest growth opportunities in your domain over the next 2-3 years, and how are you preparing for them?",
        type: "communication",
      },
    ];

    if (domain === "software_engineering") {
      questionPool.unshift(
        {
          text: "How do you evaluate trade-offs between shipping quickly vs architectural purity and paying down technical debt?",
          type: "technical",
        },
        {
          text: "Can you explain how you approach debugging a high-latency issue in a distributed production environment?",
          type: "technical",
        },
      );
    } else if (domain === "finance_and_accounting") {
      questionPool.unshift(
        {
          text: "How do you ensure audit readiness and rigorous internal controls across variance analyses and budget forecasting?",
          type: "technical",
        },
      );
    } else if (domain === "healthcare_and_clinical") {
      questionPool.unshift(
        {
          text: "How do you balance rapid clinical intervention with strict adherence to patient consent and privacy protocols under pressure?",
          type: "situational",
        },
      );
    }

    const nextPick = questionPool.find((q) => !askedTexts.has(q.text.toLowerCase())) ?? {
      text: "What has been your proudest professional achievement to date, and why does it stand out?",
      type: "behavioral",
    };

    return this.questionRepo.create({
      sessionId: session.id,
      text: nextPick.text,
      type: nextPick.type as any,
      confidence: 85,
      isFollowUp: false,
      classification: { signals: ["Adaptive session progression"] },
    });
  }

  private generateSummaryReport(session: any, questions: any[], answers: any[]): PracticeSessionReport {
    const evaluations: AnswerEvaluation[] = answers
      .map((a) => a.payload?.evaluation as AnswerEvaluation | undefined)
      .filter((e): e is AnswerEvaluation => Boolean(e));

    const totalEvaluations = evaluations.length || 1;
    const avgOverall = Math.round(
      evaluations.reduce((sum, e) => sum + e.overallScore, 0) / totalEvaluations,
    );

    // Competency breakdown
    const competencyBreakdown: Record<string, number> = {};
    for (const ev of evaluations) {
      for (const comp of ev.demonstratedCompetencies) {
        competencyBreakdown[comp] = Math.min(100, (competencyBreakdown[comp] ?? 70) + 5);
      }
    }

    // Communication aggregation
    let totalFillers = 0;
    for (const a of answers) {
      const comm = a.payload?.communicationFeedback as CommunicationFeedback | undefined;
      if (comm) totalFillers += comm.fillerWordsCount;
    }

    const allStrengths = [...new Set(evaluations.flatMap((e) => e.strengths))];
    const allGaps = [...new Set(evaluations.flatMap((e) => e.gaps))];
    const allImprovements = [...new Set(evaluations.flatMap((e) => e.actionableImprovements))];

    const improvedAnswerExamples = questions.slice(0, 2).map((q) => ({
      question: q.text,
      exampleAnswer: `Strong structured answer: Begin with a direct statement of action. Cite a 1-2 sentence real-world situation, your explicit individual contribution, and quantifiable impact.`,
    }));

    return {
      overallScore: avgOverall,
      overallAssessment:
        avgOverall >= 80
          ? "Exceptional practice performance! Candidate demonstrates strong executive presence, structured thinking, and solid domain expertise."
          : avgOverall >= 65
          ? "Good baseline interview readiness. Answers are relevant and professional; focus on backing claims with specific numbers and concise STAR transitions."
          : "Practice session identified key growth areas: structure responses using STAR and ensure answers directly address the primary question asked.",
      competencyBreakdown,
      strengths: allStrengths.slice(0, 4),
      weaknesses: allGaps.slice(0, 4),
      communicationQuality: {
        rating: totalFillers <= 3 ? "Excellent" : totalFillers <= 8 ? "Good" : "Needs Improvement",
        fillerWordsTotal: totalFillers,
        concisenessNotes: "Target 1.5 - 2 minutes spoken answer length per question.",
      },
      technicalDomainAssessment: `Strong alignment with ${session.settings.domain ?? "the target professional domain"}.`,
      missedOpportunities: allImprovements.slice(0, 3),
      recommendedLearningAreas: [
        "Quantifying business impact in metrics (e.g. %, $, hours).",
        "Structuring behavioral answers using the STAR framework.",
        "Proactively anticipating follow-up questions.",
      ],
      improvedAnswerExamples,
      suggestedNextSessionFocus:
        allGaps.length > 0 ? `Focus on: ${allGaps[0]}` : "Practice rapid technical explanations under strict time constraints.",
    };
  }
}
