// shared/types/conversation.ts

import type { ISODateString, UUID } from "./common";

/**
 * Speaker participating in an interview conversation.
 */
export type SpeakerRole = "interviewer" | "candidate" | "unknown";

/**
 * High-level conversational intent.
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

/**
 * Interview question category.
 */
export type QuestionType =
  | "behavioral"
  | "technical"
  | "coding"
  | "system_design"
  | "product"
  | "case"
  | "communication"
  | "experience"
  | "motivation"
  | "situational"
  | "general"
  | "unknown";

/**
 * Topic transition type.
 */
export type TopicChangeType = "new_topic" | "subtopic" | "return" | "none";

/**
 * Canonical conversational transcript segment.
 *
 * This is the shared/domain representation used by:
 *
 * client
 * desktop
 * server
 * core
 *
 * The audio subsystem uses AudioTranscriptSegment because its
 * representation is intentionally pipeline-specific.
 */
export interface TranscriptSegment {
  readonly id: UUID;

  readonly sessionId: UUID;

  readonly speaker: SpeakerRole;

  readonly text: string;

  readonly startMs: number;

  readonly endMs: number;

  readonly isFinal: boolean;

  readonly confidence?: number;

  readonly createdAt: ISODateString;
}

/**
 * A logical conversational turn.
 */
export interface ConversationTurn {
  readonly id: UUID;

  readonly segmentId: UUID;

  readonly speaker: SpeakerRole;

  readonly text: string;

  readonly timestamp: ISODateString;

  readonly intent: ConversationIntent;

  readonly question?: QuestionAnalysis;

  readonly topic?: TopicAnalysis;

  readonly confidence: number;
}

/**
 * Question analysis.
 */
export interface QuestionAnalysis {
  readonly isQuestion: boolean;

  readonly type: QuestionType;

  readonly normalizedText: string;

  readonly confidence: number;

  readonly requiresCandidateAnswer: boolean;

  readonly explicitQuestionMark: boolean;

  readonly questionSignals: readonly string[];
}

/**
 * Follow-up relationship analysis.
 */
export interface FollowUpAnalysis {
  readonly isFollowUp: boolean;

  readonly confidence: number;

  readonly parentQuestionId?: UUID;

  readonly relationship:
    "direct" | "deepening" | "clarifying" | "challenging" | "none";
}

/**
 * Question repetition analysis.
 */
export interface RepetitionAnalysis {
  readonly isRepeated: boolean;

  readonly confidence: number;

  readonly matchedQuestionId?: UUID;

  readonly similarity: number;
}

/**
 * Clarification analysis.
 */
export interface ClarificationAnalysis {
  readonly isClarification: boolean;

  readonly confidence: number;

  readonly target?: string;
}

/**
 * Topic analysis.
 */
export interface TopicAnalysis {
  readonly topic: string;

  readonly confidence: number;

  readonly changeType: TopicChangeType;

  readonly previousTopic?: string;

  readonly keywords: readonly string[];
}

/**
 * Intent analysis.
 */
export interface IntentAnalysis {
  readonly intent: ConversationIntent;

  readonly confidence: number;

  readonly signals: readonly string[];
}

/**
 * Complete conversation analysis result.
 */
export interface ConversationAnalysis {
  readonly turn: ConversationTurn;

  readonly question?: QuestionAnalysis;

  readonly followUp: FollowUpAnalysis;

  readonly repetition: RepetitionAnalysis;

  readonly clarification: ClarificationAnalysis;

  readonly topic: TopicAnalysis;

  readonly intent: IntentAnalysis;

  readonly recentTurns: readonly ConversationTurn[];
}

/**
 * Serializable conversation-memory snapshot.
 */
export interface ConversationMemorySnapshot {
  readonly turns: readonly ConversationTurn[];

  readonly activeTopic?: TopicAnalysis;

  readonly lastQuestion?: ConversationTurn;

  readonly questionHistory: readonly ConversationTurn[];

  readonly candidateAnswerCount: number;

  readonly interviewerTurnCount: number;
}
