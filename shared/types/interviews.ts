// ============================================================================
// FILE: shared/types/interviews.ts
//
// PURPOSE:
// Canonical shared contracts for the Veyra Interview domain.
//
// ARCHITECTURAL RESPONSIBILITY:
//
//     core/conversation
//            ↓
//     ConversationAnalysis
//            ↓
//     core/interview
//            ↓
//     InterviewClassification
//     InterviewTask
//     InterviewAnalysis
//
// Interview answers/guidance are also represented here as transport-safe DTOs.
//
// IMPORTANT:
//
// This file contains contracts only.
//
// It must NOT:
// - import core/interview
// - import core/conversation implementations
// - import core/candidate
// - import core/context
// - contain classification logic
// - contain answer-generation logic
// ============================================================================

import type { ConversationAnalysis } from "./conversation";

import type { InterviewType } from "../constants/interviewTypes";

// ============================================================================
// INTERVIEW CLASSIFICATION
// ============================================================================

/**
 * Classification of what kind of interview/task is currently happening.
 *
 * This is intentionally different from ConversationQuestionType.
 *
 * ConversationQuestionType answers:
 *
 *     "What conversational form does this question have?"
 *
 * InterviewType answers:
 *
 *     "What kind of interview/task is this?"
 */
export interface InterviewClassification {
  readonly type: InterviewType;

  readonly confidence: number;

  readonly alternatives: readonly InterviewClassificationAlternative[];

  readonly signals: readonly string[];

  /**
   * The conversational question type that contributed to the
   * classification, when available.
   */
  readonly questionType?: ConversationAnalysis["question"]["type"];
}

// ============================================================================
// ALTERNATIVE CLASSIFICATION
// ============================================================================

export interface InterviewClassificationAlternative {
  readonly type: InterviewType;

  readonly confidence: number;
}

// ============================================================================
// INTERVIEW TASK
// ============================================================================

/**
 * Represents the concrete task currently being performed.
 *
 * Examples:
 *
 *     coding
 *     system_design
 *     behavioral
 *     product
 *     case
 */
export interface InterviewTask {
  /**
   * Stable task identifier.
   */
  readonly id: string;

  /**
   * High-level interview/task category.
   */
  readonly type: InterviewType;

  /**
   * Original question or task text.
   */
  readonly questionText: string;

  /**
   * Whether the task expects a response.
   */
  readonly requiresResponse: boolean;

  /**
   * Confidence that this task classification is correct.
   */
  readonly confidence: number;
}

// ============================================================================
// COMPLETE INTERVIEW ANALYSIS
// ============================================================================

/**
 * Complete interview-domain interpretation of the current conversation state.
 *
 * ConversationAnalysis remains the source of conversational truth.
 *
 * InterviewAnalysis adds interview-specific interpretation on top.
 */
export interface InterviewAnalysis {
  readonly classification: InterviewClassification;

  readonly currentTask?: InterviewTask;

  readonly conversation: ConversationAnalysis;

  readonly confidence: number;

  readonly signals: readonly string[];
}

// ============================================================================
// ANSWER GUIDANCE
// ============================================================================

/**
 * Cross-boundary answer guidance.
 *
 * This does NOT represent the final generated answer.
 *
 * It represents structured guidance that may be consumed by:
 *
 *     core/ai
 *     desktop UI
 *     copilot presentation
 */
export interface InterviewAnswerGuidance {
  readonly type: InterviewType;

  readonly headline?: string;

  readonly sections?: readonly InterviewAnswerSection[];

  readonly talkingPoints: readonly string[];

  readonly cautions: readonly string[];

  readonly confidence: number;

  readonly sourceQuestion?: string;
}

// ============================================================================
// ANSWER SECTION
// ============================================================================

export interface InterviewAnswerSection {
  readonly id: string;

  readonly title: string;

  readonly content: string;

  readonly priority: "primary" | "secondary";
}

// ============================================================================
// INTERVIEW ANALYSIS REQUEST
// ============================================================================

/**
 * Shared request used when another application layer asks Interview
 * to interpret an existing ConversationAnalysis.
 */
export interface InterviewAnalysisRequest {
  readonly conversation: ConversationAnalysis;

  readonly candidateId?: string;

  readonly signal?: AbortSignal;
}
