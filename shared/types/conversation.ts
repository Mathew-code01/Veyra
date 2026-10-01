// ============================================================================
// FILE: shared/types/conversation.ts
// PURPOSE:
// Canonical conversation-domain types shared across Veyra.
//
// ARCHITECTURAL RULE:
// This file is the single source of truth for conversation data contracts.
//
// It must NOT:
// - depend on core/conversation
// - depend on core/audio
// - contain interview-specific classification
// - contain implementation logic
//
// Interview-specific interpretation belongs to:
//     core/interview
//
// Audio-specific interpretation belongs to:
//     core/audio
// ============================================================================

import type { ISODateString, UUID } from "./common";

// ============================================================================
// SPEAKER
// ============================================================================

/**
 * Generic conversational speaker role.
 *
 * Conversation must remain domain-neutral.
 *
 * "candidate" and "interviewer" deliberately do NOT belong here.
 * Those semantics belong to core/interview.
 */
export type SpeakerRole = "participant" | "assistant" | "system" | "unknown";

// ============================================================================
// CONVERSATIONAL INTENT
// ============================================================================

/**
 * High-level conversational intent.
 *
 * This describes what a participant is doing conversationally.
 *
 * It does NOT describe:
 * - interview type
 * - coding question
 * - behavioral question
 * - technical question
 * - system design
 * - product interview
 */
export type ConversationIntent =
  | "question"
  | "follow_up"
  | "clarification"
  | "statement"
  | "acknowledgement"
  | "correction"
  | "task"
  | "topic_change"
  | "answer"
  | "unknown";

// ============================================================================
// QUESTION TYPE
// ============================================================================

/**
 * Conversational form of a question.
 *
 * This is intentionally domain-neutral.
 */
export type ConversationQuestionType =
  | "open_ended"
  | "yes_no"
  | "choice"
  | "request"
  | "confirmation"
  | "clarification"
  | "unknown";

// ============================================================================
// TOPIC
// ============================================================================

export type TopicChangeType = "new_topic" | "subtopic" | "return" | "none";

// ============================================================================
// CANONICAL TRANSCRIPT SEGMENT
// ============================================================================

/**
 * Canonical transcript segment consumed by core/conversation.
 *
 * Audio may produce richer audio-specific representations.
 * Those are mapped into this type before conversation analysis.
 */
export interface TranscriptSegment {
  readonly id: UUID;

  readonly sessionId: UUID;

  /**
   * Generic conversational speaker role.
   */
  readonly speaker: SpeakerRole;

  /**
   * Stable speaker identity when available.
   *
   * Example:
   *     "speaker-1"
   *     "speaker-2"
   *
   * This is intentionally different from semantic roles such as
   * candidate/interviewer.
   */
  readonly speakerId?: string;

  readonly text: string;

  /**
   * Start timestamp in Unix milliseconds.
   */
  readonly startMs: number;

  /**
   * End timestamp in Unix milliseconds.
   */
  readonly endMs: number;

  readonly isFinal: boolean;

  readonly confidence?: number;

  readonly createdAt: ISODateString;

  /**
   * Identifies the subsystem that produced the segment.
   */
  readonly source?: "audio" | "text" | "system" | "unknown";
}

// ============================================================================
// CONVERSATION TURN
// ============================================================================

export interface ConversationTurn {
  readonly id: UUID;

  readonly segmentId: UUID;

  readonly speaker: SpeakerRole;

  readonly speakerId?: string;

  readonly text: string;

  readonly timestamp: ISODateString;

  readonly intent: ConversationIntent;

  readonly question?: QuestionAnalysis;

  readonly topic?: TopicAnalysis;

  readonly confidence: number;
}

// ============================================================================
// QUESTION ANALYSIS
// ============================================================================

export interface QuestionAnalysis {
  readonly isQuestion: boolean;

  readonly type: ConversationQuestionType;

  readonly normalizedText: string;

  readonly confidence: number;

  /**
   * Generic conversational requirement.
   *
   * This deliberately replaces the old:
   *     requiresCandidateAnswer
   */
  readonly requiresResponse: boolean;

  readonly explicitQuestionMark: boolean;

  readonly questionSignals: readonly string[];
}

// ============================================================================
// FOLLOW-UP
// ============================================================================

export interface FollowUpAnalysis {
  readonly isFollowUp: boolean;

  readonly confidence: number;

  readonly parentQuestionId?: UUID;

  readonly relationship:
    "direct" | "deepening" | "clarifying" | "challenging" | "none";
}

// ============================================================================
// REPETITION
// ============================================================================

export interface RepetitionAnalysis {
  readonly isRepeated: boolean;

  readonly confidence: number;

  readonly matchedQuestionId?: UUID;

  readonly similarity: number;
}

// ============================================================================
// CLARIFICATION
// ============================================================================

export interface ClarificationAnalysis {
  readonly isClarification: boolean;

  readonly confidence: number;

  readonly target?: string;
}

// ============================================================================
// TOPIC
// ============================================================================

export interface TopicAnalysis {
  readonly topic: string;

  readonly confidence: number;

  readonly changeType: TopicChangeType;

  readonly previousTopic?: string;

  readonly keywords: readonly string[];
}

// ============================================================================
// INTENT
// ============================================================================

export interface IntentAnalysis {
  readonly intent: ConversationIntent;

  readonly confidence: number;

  readonly signals: readonly string[];
}

// ============================================================================
// COMPLETE ANALYSIS
// ============================================================================

export interface ConversationAnalysis {
  readonly turn: ConversationTurn;

  readonly question: QuestionAnalysis;

  readonly followUp: FollowUpAnalysis;

  readonly repetition: RepetitionAnalysis;

  readonly clarification: ClarificationAnalysis;

  readonly topic: TopicAnalysis;

  readonly intent: IntentAnalysis;

  readonly recentTurns: readonly ConversationTurn[];
}

// ============================================================================
// MEMORY SNAPSHOT
// ============================================================================

export interface ConversationMemorySnapshot {
  readonly sessionId: UUID;

  readonly turns: readonly ConversationTurn[];

  readonly activeTopic?: TopicAnalysis;

  readonly lastQuestion?: ConversationTurn;

  readonly questionHistory: readonly ConversationTurn[];

  /**
   * Number of conversational questions observed.
   */
  readonly questionCount: number;

  /**
   * Number of turns classified as responses to previous questions.
   */
  readonly responseCount: number;

  /**
   * Number of distinct speaker identities observed.
   */
  readonly participantCount: number;
}
