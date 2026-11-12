// ============================================================================
// FILE: core/interview/postinterview/PostInterviewAnalysisEngine.ts
// PURPOSE:
// Post-interview analysis engine (Phase 15).
//
// RESPONSIBILITY:
// - Consume a completed interview session: questions, answers, candidate
//   evidence/memory, role requirements.
// - Produce a question-by-question review with transparent evaluation.
// - Derive strengths, weaknesses, missed opportunities.
// - Generate a personalised learning plan and progress insights.
//
// ARCHITECTURAL RULE:
// This engine reuses the existing interview intelligence engines
// (QuestionUnderstandingEngine, AnswerPlanningEngine, AnswerEvaluationEngine,
// CommunicationAssistanceEngine, FollowUpIntelligenceEngine,
// ProfessionalDomainClassifier). It does NOT call an AI provider, does NOT
// invent candidate experience, and does NOT fabricate scores. Every score
// includes the criteria used, supporting evidence, and an explicit confidence.
//
// One canonical orchestration path: this engine is invoked from the unified
// interview runtime boundary and the post-interview UI.
// ============================================================================

import type { AnswerRepository } from "../../../database/repositories/answerRepository";
import type { MemoryRepository } from "../../../database/repositories/memoryRepository";
import type { QuestionRepository } from "../../../database/repositories/questionRepository";
import type { SessionRepository } from "../../../database/repositories/sessionRepository";
import type {
  AnswerEvaluation,
  AnswerPlan,
  CommunicationFeedback,
  FollowUpQuestion,
  InterviewDomain,
  QuestionUnderstanding,
} from "../../../shared/types/interviews";
import type {
  LearningPlan,
  PostInterviewAnalysisInput,
  PostInterviewReview,
  ProgressInsight,
  ProgressInsights,
  QuestionReview,
  ReviewEvidence,
  StrengthWeakness,
  TransparentEvaluation,
} from "../../../shared/types/postinterview";

import { AnswerEvaluationEngine } from "../evaluation/AnswerEvaluationEngine";
import {
  AnswerPlanningEngine,
  type CandidateEvidenceItem,
} from "../planning/AnswerPlanningEngine";
import { CommunicationAssistanceEngine } from "../communication/CommunicationAssistanceEngine";
import { FollowUpIntelligenceEngine } from "../followup/FollowUpIntelligenceEngine";
import { ProfessionalDomainClassifier } from "../classification/ProfessionalDomainClassifier";
import { QuestionUnderstandingEngine } from "../understanding/QuestionUnderstandingEngine";

// ============================================================================
// OPTIONS
// ============================================================================

export interface PostInterviewAnalysisEngineOptions {
  readonly sessionRepository: SessionRepository;
  readonly questionRepository: QuestionRepository;
  readonly answerRepository: AnswerRepository;
  readonly memoryRepository?: MemoryRepository;

  readonly questionUnderstanding: QuestionUnderstandingEngine;
  readonly answerPlanning: AnswerPlanningEngine;
  readonly answerEvaluation: AnswerEvaluationEngine;
  readonly communication: CommunicationAssistanceEngine;
  readonly followUp: FollowUpIntelligenceEngine;
  readonly domainClassifier: ProfessionalDomainClassifier;

  /**
   * Retrieves candidate evidence/memory relevant to a query for a profile.
   * Injected so the engine stays storage-agnostic and profile-isolated.
   */
  readonly retrieveCandidateContext?: (
    profileId: string,
    candidateId: string | undefined,
    query: string,
    signal?: AbortSignal,
  ) => Promise<readonly ReviewEvidence[]>;
}

// ============================================================================
// ENGINE
// ============================================================================

export class PostInterviewAnalysisEngine {
  private readonly sessionRepository: SessionRepository;
  private readonly questionRepository: QuestionRepository;
  private readonly answerRepository: AnswerRepository;
  private readonly memoryRepository?: MemoryRepository;
  private readonly questionUnderstanding: QuestionUnderstandingEngine;
  private readonly answerPlanning: AnswerPlanningEngine;
  readonly answerEvaluation: AnswerEvaluationEngine;
  private readonly communication: CommunicationAssistanceEngine;
  private readonly followUp: FollowUpIntelligenceEngine;
  private readonly domainClassifier: ProfessionalDomainClassifier;
  private readonly retrieveCandidateContext?: PostInterviewAnalysisEngineOptions["retrieveCandidateContext"];

  public constructor(options: PostInterviewAnalysisEngineOptions) {
    this.sessionRepository = options.sessionRepository;
    this.questionRepository = options.questionRepository;
    this.answerRepository = options.answerRepository;
    this.memoryRepository = options.memoryRepository;
    this.questionUnderstanding = options.questionUnderstanding;
    this.answerPlanning = options.answerPlanning;
    this.answerEvaluation = options.answerEvaluation;
    this.communication = options.communication;
    this.followUp = options.followUp;
    this.domainClassifier = options.domainClassifier;
    this.retrieveCandidateContext = options.retrieveCandidateContext;
  }

  // =========================================================================
  // PUBLIC ENTRY POINT: full post-interview review
  // =========================================================================

  public async analyze(input: PostInterviewAnalysisInput): Promise<PostInterviewAnalysisEngineResult> {
    this.throwIfAborted(input.signal);

    const session = this.sessionRepository.getById(input.sessionId);
    if (!session) {
      throw new Error(`Session ${input.sessionId} not found.`);
    }

    const questions = this.questionRepository.listBySession(input.sessionId);
    const answers = this.answerRepository.listBySession(input.sessionId);
    const answerByQuestion = new Map(
      answers.map((a) => [a.questionId, a]),
    );

    const profileId = session.profileId;
    const candidateId = (session.settings as any)?.candidateId;
    const targetRole = (session.settings as any)?.targetRole;
    const domain = ((session.settings as any)?.domain as InterviewDomain) ?? "general_employment";

    const questionReviews: QuestionReview[] = [];

    for (const question of questions) {
      this.throwIfAborted(input.signal);

      const review = await this.reviewQuestion({
        sessionId: input.sessionId,
        profileId,
        candidateId,
        domain,
        targetRole,
        question,
        answer: answerByQuestion.get(question.id) ?? null,
        signal: input.signal,
      });
      questionReviews.push(review);
    }

    const evaluation = this.aggregateEvaluation(questionReviews);
    const strengths = this.aggregateStrengths(questionReviews);
    const weaknesses = this.aggregateWeaknesses(questionReviews);
    const communication = this.aggregateCommunication(answers);

    const review: PostInterviewReview = Object.freeze({
      sessionId: input.sessionId,
      overallScore: evaluation.overallScore,
      overallAssessment: this.overallAssessment(evaluation, strengths, weaknesses),
      questionReviews: Object.freeze(questionReviews),
      strengths: Object.freeze(strengths),
      weaknesses: Object.freeze(weaknesses),
      missedOpportunities: Object.freeze(
        [...new Set(questionReviews.flatMap((r) => r.missing))],
      ),
      communicationQuality: Object.freeze(communication ?? null),
      generatedAt: new Date().toISOString(),
      basis: evaluation.basis,
    });

    return Object.freeze({ review, questions, answers });
  }

  public async generateLearningPlan(
    input: PostInterviewAnalysisInput,
  ): Promise<LearningPlan> {
    this.throwIfAborted(input.signal);

    const { review } = await this.analyze(input);

    const priorityWeaknesses = review.weaknesses
      .filter((w) => w.severity === "significant" || w.severity === "moderate")
      .map((w) => w.area);

    const activities: LearningActivity[] = [];
    for (const weakness of priorityWeaknesses.slice(0, 5)) {
      activities.push({
        id: `activity-${weakness.replace(/\s+/g, "-").toLowerCase()}`,
        title: `Practice: ${weakness}`,
        description: `Targeted practice questions to strengthen ${weakness}.`,
        type: "practice_question",
        relatedCompetency: weakness,
        exampleQuestion: `Tell me about a time you demonstrated ${weakness}.`,
        targetImprovement: weakness,
        measurableGoal: "Answer two practice questions in this area with an evaluation score of 70 or higher.",
      });
    }

    const measurableImprovementGoals: string[] = [
      "Raise overall evaluation score by 10 points on the next practice session.",
      "Address every gap flagged in this review at least once.",
    ];

    return Object.freeze({
      sessionId: input.sessionId,
      priorityWeaknesses: Object.freeze(priorityWeaknesses),
      activities: Object.freeze(activities),
      measurableImprovementGoals: Object.freeze(measurableImprovementGoals),
      suggestedReviewPoints: Object.freeze([
        "Re-review after the next practice session.",
        "Track progress by competency across sessions.",
      ]),
      generatedAt: new Date().toISOString(),
    });
  }

  public async getProgressInsights(
    input: PostInterviewAnalysisInput,
  ): Promise<ProgressInsights> {
    this.throwIfAborted(input.signal);

    const session = this.sessionRepository.getById(input.sessionId);
    if (!session) {
      throw new Error(`Session ${input.sessionId} not found.`);
    }

    const profileId = session.profileId;
    const previousSessions = (this.sessionRepository.listByProfile?.(
      profileId,
    ) ?? []).filter((s) => s.id !== input.sessionId && s.status === "completed");

    const currentReview = (await this.analyze(input)).review;
    const competencyInsights: ProgressInsight[] = [];

    const competencyScores = new Map<string, number[]>();
    for (const q of currentReview.questionReviews) {
      for (const c of q.intent.assessedCompetencies) {
        const arr = competencyScores.get(c) ?? [];
        arr.push(q.evaluation.overallScore);
        competencyScores.set(c, arr);
      }
    }

    for (const [competency, scores] of competencyScores) {
      const currentScore =
        scores.reduce((s, v) => s + v, 0) / scores.length;
      competencyInsights.push({
        competency,
        currentScore: Math.round(currentScore),
        trend: "insufficient_data",
        sessionsCompared: previousSessions.length + 1,
      });
    }

    return Object.freeze({
      sessionId: input.sessionId,
      overallTrend: "insufficient_data",
      competencyInsights: Object.freeze(competencyInsights),
      recurringWeaknesses: Object.freeze(
        review.weaknesses.map((w) => w.area),
      ),
      improvedAnswerQuality: previousSessions.length === 0,
      generatedAt: new Date().toISOString(),
    });
  }

  // =========================================================================
  // PRIVATE: per-question review
  // =========================================================================

  private async reviewQuestion(input: {
    readonly sessionId: string;
    readonly profileId: string;
    readonly candidateId: string | undefined;
    readonly domain: InterviewDomain;
    readonly targetRole: string | undefined;
    readonly question: { readonly id: string; readonly text: string; readonly type?: string; readonly classification?: unknown };
    readonly answer: { readonly candidateAnswerText?: string; readonly payload?: unknown } | null;
    readonly signal?: AbortSignal;
  }): Promise<QuestionReview> {
    this.throwIfAborted(input.signal);

    const understanding = this.questionUnderstanding.understand(
      input.question.text,
    );

    this.throwIfAborted(input.signal);

    const evidence = await this.retrieveEvidence(
      input.profileId,
      input.candidateId,
      input.question.text,
      input.signal,
    );

    const plan = this.answerPlanning.plan(
      understanding,
      input.domain,
      evidence.map((e) => ({
        id: e.id,
        text: e.text,
        sourceType: e.source,
        confidence: e.verified ? 1 : 0.7,
      })),
    );

    const evaluation = this.evaluateAnswer(
      input.question.text,
      understanding,
      input.domain,
      input.targetRole,
      input.answer?.candidateAnswerText ?? "",
      evidence,
    );

    this.throwIfAborted(input.signal);

    const followUps = this.followUp.generateFollowUps(
      input.answer?.candidateAnswerText ?? "",
      understanding,
      input.domain,
    );

    return Object.freeze({
      questionId: input.question.id,
      questionText: input.question.text,
      intent: Object.freeze({
        coreIntent: understanding.coreIntent,
        assessedCompetencies: Object.freeze(understanding.assessedCompetencies),
        expectedResponseType: understanding.expectedResponseType,
        requirements: understanding.requirements,
        isMultiPart: understanding.isMultiPart,
        parts: Object.freeze(understanding.parts ?? []),
        isAmbiguous: understanding.isAmbiguous,
        ambiguityReason: understanding.ambiguityReason,
      }),
      response: input.answer
        ? Object.freeze({
            questionId: input.question.id,
            answerText: (input.answer.payload as any)?.candidateAnswerText ?? "",
            answeredAt: undefined,
            confidence: (input.answer.payload as any)?.confidence,
          })
        : null,
      relevantEvidence: Object.freeze(evidence),
      addressed: Object.freeze(
        evaluation.demonstratedCompetencies.length > 0
          ? evaluation.demonstratedCompetencies
          : [],
      ),
      missing: Object.freeze([
        ...evaluation.gaps,
        ...evaluation.ambiguities,
      ]),
      improvementOpportunities: Object.freeze(evaluation.actionableImprovements),
      suggestedStructure: Object.freeze(plan.steps.map((s) => s.phase)),
      followUps: Object.freeze(followUps),
      evaluation: this.buildTransparentEvaluation(evaluation, evidence),
      confidence: Math.min(1, evaluation.overallScore / 100),
      limitations: Object.freeze([
        understanding.isAmbiguous ? "Question intent is ambiguous." : "",
        evidence.length === 0 ? "No candidate evidence was retrieved." : "",
        !input.answer ? "No answer was recorded." : "",
      ].filter(Boolean)),
    });
  }

  // =========================================================================
  // PRIVATE: evaluation, aggregation, helpers
  // =========================================================================

  private evaluateAnswer(
    questionText: string,
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
    targetRole: string | undefined,
    answerText: string,
    evidence: readonly ReviewEvidence[],
  ): AnswerEvaluation {
    return this.answerEvaluation.evaluate({
      answerText,
      questionUnderstanding: understanding,
      domain,
      targetRole,
      availableEvidenceIds: evidence.map((e) => e.id),
    });
  }

  private buildTransparentEvaluation(
    evaluation: AnswerEvaluation,
    evidence: readonly ReviewEvidence[],
  ): TransparentEvaluation {
    const dimensions: readonly EvaluationDimensionSummary[] = Object.entries(
      evaluation.dimensions,
    ).map(([dimension, value]) => ({
      dimension,
      score: value.score,
      feedback: value.feedback,
      criteria: this.dimensionCriteria(dimension),
      evidence: evaluation.supportingEvidenceIds ?? [],
      confidence: Math.min(1, value.score / 100),
    }));

    return Object.freeze({
      overallScore: evaluation.overallScore,
      dimensions,
      demonstratedCompetencies: Object.freeze(evaluation.demonstratedCompetencies),
      strengths: Object.freeze(evaluation.strengths),
      gaps: Object.freeze(evaluation.gaps),
      ambiguities: Object.freeze(evaluation.ambiguities),
      actionableImprovements: Object.freeze(evaluation.actionableImprovements),
      supportingEvidenceIds: Object.freeze(evidence.map((e) => e.id)),
      suggestedRevision: evaluation.suggestedRevision,
      basis: "evaluation_engine",
    });
  }

  private dimensionCriteria(dimension: string): readonly string[] {
    const criteria: Record<string, readonly string[]> = {
      relevance: ["Answer addresses the core intent of the question."],
      completeness: ["All parts of a multi-part question are covered."],
      clarity: ["Answer is easy to follow and free of jargon unless required."],
      structure: ["Answer uses a logical structure (e.g. STAR, problem-solution)."],
      accuracy: ["Technical or professional claims are consistent with evidence."],
      evidenceGrounding: ["Claims are backed by specific candidate evidence."],
      professionalism: ["Tone and language are appropriate for the role."],
      communication: ["Filler words and repetition are minimised."],
      reasoningConfidence: ["Reasoning steps are explicit and coherent."],
      conciseness: ["Answer is focused without unnecessary detail."],
      roleAlignment: ["Answer maps to the target role requirements."],
    };
    return Object.freeze(criteria[dimension] ?? []);
  }

  private aggregateEvaluation(
    reviews: readonly QuestionReview[],
  ): TransparentEvaluation {
    if (reviews.length === 0) {
      return Object.freeze({
        overallScore: 0,
        dimensions: Object.freeze([]),
        demonstratedCompetencies: Object.freeze([]),
        strengths: Object.freeze([]),
        gaps: Object.freeze(["No answered questions to evaluate."]),
        ambiguities: Object.freeze([]),
        actionableImprovements: Object.freeze(["Complete at least one interview question."]),
        supportingEvidenceIds: Object.freeze([]),
        suggestedRevision: undefined,
        basis: "insufficient_data",
      });
    }

    const dimensionNames = [
      "relevance", "completeness", "clarity", "structure", "accuracy",
      "evidenceGrounding", "professionalism", "communication",
      "reasoningConfidence", "conciseness", "roleAlignment",
    ] as const;

    const dimensionAverages: Record<string, number> = {};
    const dimensionFeedback: Record<string, string[]> = {};
    for (const dim of dimensionNames) {
      const vals = reviews
        .map((r) => r.evaluation.dimensions.find((d) => d.dimension === dim))
        .filter((d): d is { readonly score: number; readonly feedback: string } => Boolean(d));
      if (vals.length > 0) {
        dimensionAverages[dim] =
          vals.reduce((s, v) => s + v.score, 0) / vals.length;
        dimensionFeedback[dim] = vals.map((v) => v.feedback).join("; ");
      }
    }

    const overallScore =
      Math.round(
        Object.values(dimensionAverages).reduce((s, v) => s + v, 0) /
          Object.values(dimensionAverages).length,
      ) || 0;

    const allStrengths = [...new Set(reviews.flatMap((r) => r.evaluation.strengths))];
    const allGaps = [...new Set(reviews.flatMap((r) => r.evaluation.gaps))];
    const allImprovements = [...new Set(reviews.flatMap((r) => r.evaluation.actionableImprovements))];
    const allEvidence = [...new Set(reviews.flatMap((r) => r.evaluation.supportingEvidenceIds))];

    return Object.freeze({
      overallScore,
      dimensions: Object.freeze(
        Object.entries(dimensionAverages).map(([dim, score]) => ({
          dimension: dim,
          score: Math.round(score),
          feedback: dimensionFeedback[dim] ?? "",
          criteria: this.dimensionCriteria(dim),
          evidence: allEvidence,
          confidence: Math.min(1, score / 100),
        })),
      ),
      demonstratedCompetencies: Object.freeze(
        [...new Set(reviews.flatMap((r) => r.evaluation.demonstratedCompetencies))],
      ),
      strengths: Object.freeze(allStrengths),
      gaps: Object.freeze(allGaps),
      ambiguities: Object.freeze(
        [...new Set(reviews.flatMap((r) => r.evaluation.ambiguities))],
      ),
      actionableImprovements: Object.freeze(allImprovements),
      supportingEvidenceIds: Object.freeze(allEvidence),
      suggestedRevision: undefined,
      basis: "evaluation_engine",
    });
  }

  private aggregateStrengths(reviews: readonly QuestionReview[]): StrengthWeakness[] {
    const strengths = [...new Set(reviews.flatMap((r) => r.evaluation.strengths))];
    return Object.freeze(
      strengths.map((area) => ({
        area,
        evidence: Object.freeze(
          reviews
            .filter((r) => r.evaluation.strengths.includes(area))
            .map((r) => r.questionId),
        ),
        severity: "minor" as const,
        type: "strength" as const,
      })),
    );
  }

  private aggregateWeaknesses(reviews: readonly QuestionReview[]): StrengthWeakness[] {
    const gaps = [...new Set(reviews.flatMap((r) => r.evaluation.gaps))];
    return Object.freeze(
      gaps.map((area) => ({
        area,
        evidence: Object.freeze(
          reviews.filter((r) => r.evaluation.gaps.includes(area)).map((r) => r.questionId),
        ),
        severity: "moderate" as const,
        type: "weakness" as const,
      })),
    );
  }

  private aggregateCommunication(
    answers: readonly { readonly payload?: unknown }[],
  ): CommunicationFeedback | null {
    const answerTexts = answers
      .map((a) => a.payload?.candidateAnswerText)
      .filter((t): t is string => Boolean(t) && t.trim().length > 0);
    if (answerTexts.length === 0) {
      return null;
    }
    return this.communication.analyze(answerTexts.join(" "));
  }

  private overallAssessment(
    evaluation: TransparentEvaluation,
    strengths: readonly StrengthWeakness[],
    weaknesses: readonly StrengthWeakness[],
  ): string {
    if (evaluation.overallScore >= 75) {
      return "Strong overall performance with clear, evidence-grounded answers.";
    }
    if (evaluation.overallScore >= 50) {
      return "Competent performance with specific areas to strengthen before the next interview.";
    }
    return "Performance needs improvement; focus on the flagged gaps and practice targeted questions.";
  }

  private async retrieveEvidence(
    profileId: string,
    candidateId: string | undefined,
    query: string,
    signal?: AbortSignal,
  ): Promise<readonly ReviewEvidence[]> {
    const items: ReviewEvidence[] = [];
    if (this.retrieveCandidateContext) {
      for (const e of await this.retrieveCandidateContext(profileId, candidateId, query, signal)) {
        items.push(e);
      }
    }
    if (this.memoryRepository) {
      const memories = this.memoryRepository.search(profileId, {
        query,
        candidateId: candidateId ?? null,
        minConfidence: 40,
        limit: 6,
      });
      for (const m of memories) {
        const text = (m as any)?.content?.text;
        if (typeof text === "string" && text.trim()) {
          items.push({
            id: String((m as any).id),
            source: "memory",
            text,
            verified: (m as any).verificationStatus === "verified",
          });
        }
      }
    }
    return Object.freeze(items.slice(0, 12));
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException("Post-interview analysis was cancelled.", "AbortError");
    }
  }
}

// ============================================================================
// RESULT TYPE
// ============================================================================

export interface PostInterviewAnalysisEngineResult {
  readonly review: PostInterviewReview;
  readonly questions: readonly { readonly id: string; readonly text: string }[];
  readonly answers: readonly { readonly questionId: string; readonly candidateAnswerText?: string }[];
}
