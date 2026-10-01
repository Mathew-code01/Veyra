// ============================================================================
// FILE: shared/validation/conversationSchemas.ts
// PURPOSE:
// Runtime validation and type guards for shared conversation contracts.
//
// IMPORTANT:
// Conversation domain types themselves live in:
//     shared/types/conversation.ts
//
// This file must NOT become a second source of truth.
// ============================================================================

import type {
  ConversationIntent,
  ConversationQuestionType,
  ConversationTurn,
  SpeakerRole,
  TranscriptSegment,
} from "../types/conversation";

export type {
  ConversationAnalysis,
  ConversationIntent,
  ConversationMemorySnapshot,
  ConversationQuestionType,
  ConversationTurn,
  FollowUpAnalysis,
  IntentAnalysis,
  QuestionAnalysis,
  RepetitionAnalysis,
  SpeakerRole,
  TopicAnalysis,
  TopicChangeType,
  TranscriptSegment,
} from "../types/conversation";

// ============================================================================
// RUNTIME ENUMS
// ============================================================================

const SPEAKER_ROLES: readonly SpeakerRole[] = [
  "participant",
  "assistant",
  "system",
  "unknown",
];

const CONVERSATION_INTENTS: readonly ConversationIntent[] = [
  "question",
  "follow_up",
  "clarification",
  "statement",
  "acknowledgement",
  "correction",
  "task",
  "topic_change",
  "answer",
  "unknown",
];

const QUESTION_TYPES: readonly ConversationQuestionType[] = [
  "open_ended",
  "yes_no",
  "choice",
  "request",
  "confirmation",
  "clarification",
  "unknown",
];

// ============================================================================
// HELPERS
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isSpeakerRole(value: unknown): value is SpeakerRole {
  return (
    typeof value === "string" && SPEAKER_ROLES.includes(value as SpeakerRole)
  );
}

export function isConversationIntent(
  value: unknown,
): value is ConversationIntent {
  return (
    typeof value === "string" &&
    CONVERSATION_INTENTS.includes(value as ConversationIntent)
  );
}

export function isConversationQuestionType(
  value: unknown,
): value is ConversationQuestionType {
  return (
    typeof value === "string" &&
    QUESTION_TYPES.includes(value as ConversationQuestionType)
  );
}

// ============================================================================
// TRANSCRIPT VALIDATION
// ============================================================================

export function isTranscriptSegment(
  value: unknown,
): value is TranscriptSegment {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.id)) {
    return false;
  }

  if (!isNonEmptyString(value.sessionId)) {
    return false;
  }

  if (!isSpeakerRole(value.speaker)) {
    return false;
  }

  if (typeof value.text !== "string") {
    return false;
  }

  if (!isFiniteNonNegativeNumber(value.startMs)) {
    return false;
  }

  if (!isFiniteNonNegativeNumber(value.endMs)) {
    return false;
  }

  if (value.endMs < value.startMs) {
    return false;
  }

  if (typeof value.isFinal !== "boolean") {
    return false;
  }

  if (value.confidence !== undefined) {
    if (
      typeof value.confidence !== "number" ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 ||
      value.confidence > 1
    ) {
      return false;
    }
  }

  if (!isNonEmptyString(value.createdAt)) {
    return false;
  }

  return true;
}

// ============================================================================
// ASSERTION
// ============================================================================

export function assertTranscriptSegment(
  value: unknown,
): asserts value is TranscriptSegment {
  if (!isTranscriptSegment(value)) {
    throw new Error("Invalid conversation TranscriptSegment.");
  }
}

// ============================================================================
// CONVERSATION TURN VALIDATION
// ============================================================================

export function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.segmentId) &&
    isSpeakerRole(value.speaker) &&
    typeof value.text === "string" &&
    isNonEmptyString(value.timestamp) &&
    isConversationIntent(value.intent) &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  );
}
