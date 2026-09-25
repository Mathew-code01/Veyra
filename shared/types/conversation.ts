import type { ISODateString, UUID } from "./common";

/**
 * Participant in a conversation.
 *
 * Conversation does not assume this is an interview.
 * The same representation can be used for:
 *
 * - interviews
 * - meetings
 * - calls
 * - coaching
 * - presentations
 * - general conversations
 */
export type SpeakerRole = "interviewer" | "candidate" | "unknown";

/**
 * High-level conversational intent.
 *
 * This describes what a participant is doing conversationally.
 * It does NOT describe the interview category.
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
 * Conversational form of a question.
 *
 * This deliberately does NOT contain:
 *
 * - behavioral
 * - coding
 * - technical
 * - system_design
 * - product
 *
 * Those belong to core/interview.
 */
export type ConversationQuestionType =
  | "open_ended"
  | "yes_no"
  | "choice"
  | "request"
  | "confirmation"
  | "clarification"
  | "unknown";

/**
 * Topic transition.
 */
export type TopicChangeType = "new_topic" | "subtopic" | "return" | "none";

/**
 * Canonical transcript segment shared across Veyra.
 *
 * Audio may produce a richer internal representation,
 * but this is the cross-domain representation used when
 * conversation processing begins.
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
 * Logical conversational turn.
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
 * Conversational question analysis.
 */
export interface QuestionAnalysis {
  readonly isQuestion: boolean;

  readonly type: ConversationQuestionType;

  readonly normalizedText: string;

  readonly confidence: number;

  readonly requiresCandidateAnswer: boolean;

  readonly explicitQuestionMark: boolean;

  readonly questionSignals: readonly string[];
}

/**
 * Relationship between the current question and
 * a previous conversational question.
 */
export interface FollowUpAnalysis {
  readonly isFollowUp: boolean;

  readonly confidence: number;

  readonly parentQuestionId?: UUID;

  readonly relationship:
    "direct" | "deepening" | "clarifying" | "challenging" | "none";
}

/**
 * Repetition analysis.
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
 * Complete analysis of one conversational event.
 */
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

/**
 * Serializable conversation state.
 */
export interface ConversationMemorySnapshot {
  readonly turns: readonly ConversationTurn[];

  readonly activeTopic?: TopicAnalysis;

  readonly lastQuestion?: ConversationTurn;

  readonly questionHistory: readonly ConversationTurn[];

  readonly candidateAnswerCount: number;

  readonly interviewerTurnCount: number;
}
