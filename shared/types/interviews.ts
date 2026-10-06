//
// ============================================================================
// FILE: shared/types/interviews.ts
//
// PURPOSE:
// Canonical shared contracts for the Veyra Interview domain.
//
// ARCHITECTURE:
//
//     ConversationAnalysis
//             │
//             ▼
//     InterviewClassification
//             │
//             ▼
//     InterviewTask
//             │
//             ▼
//     InterviewAnswerGuidance
//             │
//             ▼
//     InterviewAnalysis
//
// RESPONSIBILITY:
//
// This file defines transport/domain data contracts only.
//
// It MUST NOT:
//
// - import core/interview
// - import core/candidate implementations
// - import core/context implementations
// - perform classification
// - generate AI answers
// - access storage
// - perform network requests
//
// The actual implementation belongs to core/interview.
// ============================================================================

import type { ConversationAnalysis } from "./conversation";
import type { InterviewType } from "../constants/interviewTypes";

// ============================================================================
// CLASSIFICATION
// ============================================================================

/**
 * Result of determining what kind of interview activity is currently
 * happening.
 *
 * Classification is deterministic domain intelligence owned by
 * core/interview/classification.
 */
export interface InterviewClassification {
  /**
   * Primary detected interview type.
   */
  readonly type: InterviewType;

  /**
   * Confidence in the primary classification.
   *
   * Expected range:
   *
   *     0 <= confidence <= 1
   */
  readonly confidence: number;

  /**
   * Alternative classifications considered plausible.
   *
   * Ordered from highest to lowest confidence.
   */
  readonly alternatives: readonly InterviewClassificationAlternative[];

  /**
   * Human-readable or machine-readable classification signals.
   *
   * Examples:
   *
   * - "contains behavioral prompt"
   * - "contains coding instruction"
   * - "contains system-design vocabulary"
   */
  readonly signals: readonly string[];

  /**
   * Generic conversational question type inherited from the conversation
   * subsystem.
   *
   * Interview does not redefine conversational question semantics.
   */
  readonly questionType?: ConversationAnalysis["question"]["type"];
}

// ============================================================================
// CLASSIFICATION ALTERNATIVE
// ============================================================================

/**
 * Secondary classification candidate.
 */
export interface InterviewClassificationAlternative {
  readonly type: InterviewType;

  /**
   * Confidence for this alternative.
   *
   * Expected range:
   *
   *     0 <= confidence <= 1
   */
  readonly confidence: number;
}

// ============================================================================
// INTERVIEW TASK
// ============================================================================

/**
 * The concrete task Veyra believes the interviewer/caller is asking
 * the candidate to perform.
 *
 * This is deliberately different from InterviewClassification.
 *
 * Classification answers:
 *
 *     "What kind of interview activity is this?"
 *
 * Task answers:
 *
 *     "What is the candidate being asked to do right now?"
 */
export interface InterviewTask {
  /**
   * Stable task identifier.
   *
   * Implementations should derive this from stable source information rather
   * than generating an unrelated random identifier for every analysis.
   */
  readonly id: string;

  /**
   * Interview category associated with this task.
   */
  readonly type: InterviewType;

  /**
   * Normalized question/task text.
   */
  readonly questionText: string;

  /**
   * Whether the task expects a candidate response.
   */
  readonly requiresResponse: boolean;

  /**
   * Confidence that this is the current task.
   *
   * Expected range:
   *
   *     0 <= confidence <= 1
   */
  readonly confidence: number;

  /**
   * Stable originating conversation turn.
   */
  readonly conversationTurnId?: string;

  /**
   * Stable originating transcript segment, when available.
   */
  readonly segmentId?: string;
}

// ============================================================================
// ANSWER GUIDANCE
// ============================================================================

/**
 * Deterministic structure describing how an answer should be approached.
 *
 * IMPORTANT:
 *
 * This is NOT the final answer.
 *
 * It does not:
 *
 * - call an AI provider
 * - invent candidate experience
 * - fabricate company information
 * - generate unsupported factual claims
 *
 * It gives core/ai enough structured information to generate an appropriate
 * answer later.
 */
export interface InterviewAnswerGuidance {
  /**
   * Interview category this guidance applies to.
   */
  readonly type: InterviewType;

  /**
   * Optional concise description of the recommended answer strategy.
   */
  readonly headline?: string;

  /**
   * Optional structured answer sections.
   */
  readonly sections?: readonly InterviewAnswerSection[];

  /**
   * High-value points the generated answer should cover.
   */
  readonly talkingPoints: readonly string[];

  /**
   * Things the generated answer should avoid.
   */
  readonly cautions: readonly string[];

  /**
   * Confidence that this guidance matches the current task.
   *
   * Expected range:
   *
   *     0 <= confidence <= 1
   */
  readonly confidence: number;

  /**
   * Original question used to build the guidance.
   */
  readonly sourceQuestion?: string;
}

// ============================================================================
// ANSWER SECTION
// ============================================================================

/**
 * Structured section of deterministic answer guidance.
 */
export interface InterviewAnswerSection {
  /**
   * Stable section identifier.
   */
  readonly id: string;

  /**
   * Human-readable section title.
   */
  readonly title: string;

  /**
   * Guidance content for this section.
   */
  readonly content: string;

  /**
   * Importance of the section.
   */
  readonly priority: "primary" | "secondary";
}

// ============================================================================
// COMPLETE ANALYSIS
// ============================================================================

/**
 * Complete domain-level understanding of the current interview state.
 *
 * InterviewAnalysis is the primary output consumed by downstream UI,
 * copilot, orchestration, and AI-generation layers.
 */
export interface InterviewAnalysis {
  /**
   * What kind of interview activity is occurring.
   */
  readonly classification: InterviewClassification;

  /**
   * The concrete task currently being asked, when one can be identified.
   */
  readonly currentTask?: InterviewTask;

  /**
   * Original generic conversation analysis.
   *
   * Interview enriches ConversationAnalysis rather than replacing it.
   */
  readonly conversation: ConversationAnalysis;

  /**
   * Overall confidence in the current interview interpretation.
   *
   * Expected range:
   *
   *     0 <= confidence <= 1
   */
  readonly confidence: number;

  /**
   * Combined signals from classification, task detection, candidate/context
   * enrichment, and other deterministic interview reasoning.
   */
  readonly signals: readonly string[];

  /**
   * Optional deterministic answer structure.
   *
   * This is guidance, not a generated factual answer.
   */
  readonly answerGuidance?: InterviewAnswerGuidance;

  /**
   * Candidate identity used for contextual enrichment.
   *
   * This is an identifier only.
   *
   * Candidate facts must come from the candidate/context subsystems.
   */
  readonly candidateId?: string;

  /**
   * Context IDs that contributed to this analysis.
   *
   * These identifiers provide provenance without embedding context-domain
   * implementations inside the shared Interview contract.
   */
  readonly contextIds?: readonly string[];
}

// ============================================================================
// ANALYSIS REQUEST
// ============================================================================

/**
 * Request for complete interview analysis.
 */
export interface InterviewAnalysisRequest {
  /**
   * Generic conversation state being interpreted.
   */
  readonly conversation: ConversationAnalysis;

  /**
   * Optional candidate whose context may be used for enrichment.
   */
  readonly candidateId?: string;

  /**
   * Optional cancellation signal.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// TASK REQUEST
// ============================================================================

/**
 * Request for deterministic interview-task extraction.
 *
 * This is useful when a caller needs task detection without running the
 * complete interview intelligence pipeline.
 */
export interface InterviewTaskRequest {
  /**
   * Generic conversation analysis.
   */
  readonly analysis: ConversationAnalysis;

  /**
   * Previously determined interview classification.
   */
  readonly classification: InterviewClassification;

  /**
   * Optional candidate identifier for task/context enrichment.
   */
  readonly candidateId?: string;

  /**
   * Optional cancellation signal.
   */
  readonly signal?: AbortSignal;
}
