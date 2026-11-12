// ============================================================================
// FILE: shared/types/postinterview.ts
// PURPOSE:
// Shared contracts for post-interview analysis (Phase 15).
//
// These types describe a transparent, evidence-grounded review of a
// completed interview session. They are transport/domain contracts only
// and MUST NOT perform AI generation, storage, or network access.
// ============================================================================

import type {
  AnswerEvaluation,
  CommunicationFeedback,
  FollowUpQuestion,
  QuestionUnderstanding,
} from "./interviews";

// ============================================================================
// QUESTION-LEVEL REVIEW
// ============================================================================

/**
 * The interviewer's intent for a single question, derived deterministically
 * from the question text (not invented).
 */
export interface QuestionIntent {
  readonly coreIntent: string;
  readonly assessedCompetencies: readonly string[];
  readonly expectedResponseType: QuestionUnderstanding["expectedResponseType"];
  readonly requirements: QuestionUnderstanding["requirements"];
  readonly isMultiPart: boolean;
  readonly parts: readonly string[];
  readonly isAmbiguous: boolean;
  readonly ambiguityReason?: string;
}

/**
 * The candidate's recorded response to a question, exactly as given.
 * Never paraphrased or fabricated.
 */
export interface CandidateResponse {
  readonly questionId: string;
  readonly answerText: string;
  readonly answeredAt?: string;
  readonly confidence?: number;
}

/**
 * Relevant candidate evidence used when reviewing a question, with source
 * attribution so the review can distinguish grounded facts from suggestions.
 */
export interface ReviewEvidence {
  readonly id: string;
  readonly source: "candidate" | "memory" | "context";
  readonly text: string;
  readonly verified?: boolean;
}

/**
 * A transparent, per-dimension evaluation result.
 *
 * Every score includes the criteria used, the supporting evidence, and an
 * explicit confidence so nothing is presented as an objective fact.
 */
export interface EvaluationDimensionSummary {
  readonly dimension: string;
  readonly score: number; // 0 - 100
  readonly feedback: string;
  readonly criteria: readonly string[];
  readonly evidence: readonly string[];
  readonly confidence: number; // 0 - 1
}

/**
 * A complete transparent evaluation for one question.
 */
export interface TransparentEvaluation {
  readonly overallScore: number; // 0 - 100
  readonly dimensions: readonly EvaluationDimensionSummary[];
  readonly demonstratedCompetencies: readonly string[];
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly ambiguities: readonly string[];
  readonly actionableImprovements: readonly string[];
  readonly supportingEvidenceIds: readonly string[];
  readonly suggestedRevision?: string;
  readonly basis: "evaluation_engine" | "heuristic" | "insufficient_data";
}

/**
 * A question-by-question review entry.
 */
export interface QuestionReview {
  readonly questionId: string;
  readonly questionText: string;
  readonly intent: QuestionIntent;
  readonly response: CandidateResponse | null;
  readonly relevantEvidence: readonly ReviewEvidence[];
  readonly addressed: readonly string[]; // what the answer covered well
  readonly missing: readonly string[]; // what was not covered
  readonly improvementOpportunities: readonly string[];
  readonly suggestedStructure: readonly string[];
  readonly followUps: readonly FollowUpQuestion[];
  readonly evaluation: TransparentEvaluation;
  readonly confidence: number; // 0 - 1
  readonly limitations: readonly string[];
}

// ============================================================================
// SESSION-LEVEL REVIEW
// ============================================================================

export interface StrengthWeakness {
  readonly area: string;
  readonly evidence: readonly string[]; // questionIds / evidence ids
  readonly severity: "minor" | "moderate" | "significant";
  readonly type: "strength" | "weakness";
}

export interface PostInterviewReview {
  readonly sessionId: string;
  readonly overallScore: number; // 0 - 100
  readonly overallAssessment: string;
  readonly questionReviews: readonly QuestionReview[];
  readonly strengths: readonly StrengthWeakness[];
  readonly weaknesses: readonly StrengthWeakness[];
  readonly missedOpportunities: readonly string[];
  readonly communicationQuality: CommunicationFeedback | null;
  readonly generatedAt: string;
  readonly basis: "evaluation_engine" | "heuristic" | "insufficient_data";
}

// ============================================================================
// LEARNING PLAN
// ============================================================================

export interface LearningActivity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: "practice_question" | "concept_study" | "example_review" | "exercise";
  readonly relatedCompetency: string;
  readonly relatedQuestionId?: string;
  readonly exampleQuestion?: string;
  readonly targetImprovement: string;
  readonly measurableGoal: string;
}

export interface LearningPlan {
  readonly sessionId: string;
  readonly priorityWeaknesses: readonly string[];
  readonly activities: readonly LearningActivity[];
  readonly measurableImprovementGoals: readonly string[];
  readonly suggestedReviewPoints: readonly string[];
  readonly generatedAt: string;
}

// ============================================================================
// PROGRESS
// ============================================================================

export interface ProgressInsight {
  readonly competency: string;
  readonly previousScore?: number;
  readonly currentScore: number;
  readonly trend: "improved" | "declined" | "stable" | "insufficient_data";
  readonly sessionsCompared: number;
}

export interface ProgressInsights {
  readonly sessionId: string;
  readonly overallTrend: "improved" | "declined" | "stable" | "insufficient_data";
  readonly competencyInsights: readonly ProgressInsight[];
  readonly recurringWeaknesses: readonly string[];
  readonly improvedAnswerQuality: boolean;
  readonly generatedAt: string;
}

// ============================================================================
// INPUT
// ============================================================================

export interface PostInterviewAnalysisInput {
  readonly sessionId: string;
  readonly signal?: AbortSignal;
}
