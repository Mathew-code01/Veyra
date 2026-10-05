
// ============================================================================
// FILE: shared/types/interviews.ts
//
// PURPOSE:
// Canonical shared contracts for the Veyra Interview domain.
//
// ARCHITECTURE:
//
//     ConversationAnalysis
//             ↓
//     InterviewAnalysis
//             ↓
//     InterviewClassification
//     InterviewTask
//     InterviewAnswerGuidance
//
// This file contains transport/domain contracts only.
//
// It MUST NOT:
// - import core/interview
// - import core/candidate implementations
// - import core/context implementations
// - perform classification
// - generate answers
// ============================================================================

import type { ConversationAnalysis } from "./conversation";
import type { InterviewType } from "../constants/interviewTypes";

// ============================================================================
// CLASSIFICATION
// ============================================================================

export interface InterviewClassification {
  readonly type: InterviewType;

  readonly confidence: number;

  readonly alternatives: readonly InterviewClassificationAlternative[];

  readonly signals: readonly string[];

  readonly questionType?: ConversationAnalysis["question"]["type"];
}

// ============================================================================
// CLASSIFICATION ALTERNATIVE
// ============================================================================

export interface InterviewClassificationAlternative {
  readonly type: InterviewType;

  readonly confidence: number;
}

// ============================================================================
// INTERVIEW TASK
// ============================================================================

export interface InterviewTask {
  readonly id: string;

  readonly type: InterviewType;

  readonly questionText: string;

  readonly requiresResponse: boolean;

  readonly confidence: number;

  /**
   * Stable originating conversation turn.
   */
  readonly conversationTurnId?: string;

  /**
   * Stable originating transcript segment.
   */
  readonly segmentId?: string;
}

// ============================================================================
// ANSWER GUIDANCE
// ============================================================================

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
// COMPLETE ANALYSIS
// ============================================================================

export interface InterviewAnalysis {
  readonly classification: InterviewClassification;

  readonly currentTask?: InterviewTask;

  readonly conversation: ConversationAnalysis;

  readonly confidence: number;

  readonly signals: readonly string[];

  /**
   * Optional deterministic answer structure.
   *
   * This is guidance, not a generated factual answer.
   */
  readonly answerGuidance?: InterviewAnswerGuidance;

  /**
   * Candidate identity used for contextual enrichment.
   */
  readonly candidateId?: string;

  /**
   * Context IDs that contributed to this analysis.
   */
  readonly contextIds?: readonly string[];
}

// ============================================================================
// REQUEST
// ============================================================================

export interface InterviewAnalysisRequest {
  readonly conversation: ConversationAnalysis;

  readonly candidateId?: string;

  readonly signal?: AbortSignal;
}

// ============================================================================
// TASK REQUEST
// ============================================================================

export interface InterviewTaskRequest {
  readonly analysis: ConversationAnalysis;

  readonly classification: InterviewClassification;

  readonly candidateId?: string;

  readonly signal?: AbortSignal;
}
