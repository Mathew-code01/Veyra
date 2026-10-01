// ============================================================================
// FILE: core/conversation/validation/ConversationValidator.ts
// PURPOSE:
// Validates canonical conversation transcript segments before analysis.
//
// ARCHITECTURAL RULE:
// ConversationValidator validates the canonical shared conversation model.
//
// It must NOT:
// - know about AudioBuffer
// - know about Whisper
// - know about TranscriptionEngine
// - perform audio-specific validation
// ============================================================================

import type { TranscriptSegment } from "../../../shared/types/conversation";

import { isSpeakerRole } from "../../../shared/validation/conversationSchemas";

export class ConversationValidator {
  public validateSegment(segment: TranscriptSegment): void {
    if (!segment || typeof segment !== "object") {
      throw new Error("Conversation segment is required.");
    }

    if (!segment.id || typeof segment.id !== "string") {
      throw new Error("Conversation segment id is required.");
    }

    if (!segment.sessionId || typeof segment.sessionId !== "string") {
      throw new Error("Conversation sessionId is required.");
    }

    if (!segment.createdAt || typeof segment.createdAt !== "string") {
      throw new Error("Conversation segment timestamp is required.");
    }

    const createdAt = Date.parse(segment.createdAt);

    if (!Number.isFinite(createdAt)) {
      throw new Error(
        "Conversation segment createdAt must be a valid ISO timestamp.",
      );
    }

    if (!Number.isFinite(segment.startMs) || segment.startMs < 0) {
      throw new Error("Conversation segment startMs must be >= 0.");
    }

    if (!Number.isFinite(segment.endMs) || segment.endMs < 0) {
      throw new Error("Conversation segment endMs must be >= 0.");
    }

    if (segment.endMs < segment.startMs) {
      throw new Error(
        "Conversation segment endMs cannot be earlier than startMs.",
      );
    }

    if (typeof segment.text !== "string" || segment.text.trim().length === 0) {
      throw new Error("Conversation segment text cannot be empty.");
    }

    if (segment.text.length > 100_000) {
      throw new Error("Conversation segment text is too large.");
    }

    if (!isSpeakerRole(segment.speaker)) {
      throw new Error("Conversation segment speaker is invalid.");
    }

    if (
      segment.speakerId !== undefined &&
      (typeof segment.speakerId !== "string" ||
        segment.speakerId.trim().length === 0)
    ) {
      throw new Error(
        "Conversation segment speakerId must be a non-empty string when provided.",
      );
    }

    if (segment.confidence !== undefined) {
      if (
        !Number.isFinite(segment.confidence) ||
        segment.confidence < 0 ||
        segment.confidence > 1
      ) {
        throw new Error(
          "Conversation segment confidence must be between 0 and 1.",
        );
      }
    }

    if (
      segment.source !== undefined &&
      segment.source !== "audio" &&
      segment.source !== "text" &&
      segment.source !== "system" &&
      segment.source !== "unknown"
    ) {
      throw new Error("Conversation segment source is invalid.");
    }
  }
}
