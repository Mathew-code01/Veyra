import type { TranscriptSegment } from "../../../shared/types/conversation";

export class ConversationValidator {
  validateSegment(segment: TranscriptSegment): void {
    if (!segment) {
      throw new Error("Conversation segment is required.");
    }

    if (!segment.id) {
      throw new Error("Conversation segment id is required.");
    }

    if (!segment.sessionId) {
      throw new Error("Conversation sessionId is required.");
    }

    if (!segment.createdAt) {
      throw new Error("Conversation segment timestamp is required.");
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

    if (typeof segment.text !== "string") {
      throw new Error("Conversation segment text must be a string.");
    }

    if (segment.text.length > 100_000) {
      throw new Error("Conversation segment text is too large.");
    }

    if (!segment.speaker) {
      throw new Error("Conversation segment speaker is required.");
    }
  }
}
