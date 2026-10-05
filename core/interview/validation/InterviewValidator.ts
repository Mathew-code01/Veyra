
// ============================================================================
// FILE: core/interview/validation/InterviewValidator.ts
//
// PURPOSE:
// Validates ConversationAnalysis before it enters Interview intelligence.
//
// Interview does not validate or mutate Conversation internals.
// It only verifies that the shared boundary is usable.
// ============================================================================

import type { ConversationAnalysis } from "../../../shared/types/conversation";

import { InterviewError } from "../errors/InterviewError";

export class InterviewValidator {
  public validateConversation(
    analysis: ConversationAnalysis,
  ): void {
    if (!analysis || typeof analysis !== "object") {
      throw InterviewError.invalidConversation(
        "Conversation analysis is required.",
      );
    }

    if (!analysis.turn || typeof analysis.turn !== "object") {
      throw InterviewError.invalidConversation(
        "Conversation analysis must contain a turn.",
      );
    }

    if (
      typeof analysis.turn.id !== "string" ||
      !analysis.turn.id.trim()
    ) {
      throw InterviewError.invalidConversation(
        "Conversation turn must contain a valid ID.",
        {
          turnId: String(analysis.turn?.id ?? ""),
        },
      );
    }

    if (
      typeof analysis.turn.text !== "string" ||
      !analysis.turn.text.trim()
    ) {
      throw InterviewError.invalidConversation(
        "Conversation turn must contain usable text.",
        {
          turnId: analysis.turn.id,
        },
      );
    }

    if (!analysis.question || typeof analysis.question !== "object") {
      throw InterviewError.invalidConversation(
        "Conversation analysis must contain question analysis.",
        {
          turnId: analysis.turn.id,
        },
      );
    }

    if (
      typeof analysis.question.confidence !== "number" ||
      !Number.isFinite(analysis.question.confidence) ||
      analysis.question.confidence < 0 ||
      analysis.question.confidence > 1
    ) {
      throw InterviewError.invalidConversation(
        "Question confidence must be between 0 and 1.",
        {
          turnId: analysis.turn.id,
        },
      );
    }

    if (
      typeof analysis.intent?.confidence !== "number" ||
      !Number.isFinite(analysis.intent.confidence) ||
      analysis.intent.confidence < 0 ||
      analysis.intent.confidence > 1
    ) {
      throw InterviewError.invalidConversation(
        "Intent confidence must be between 0 and 1.",
        {
          turnId: analysis.turn.id,
        },
      );
    }
  }
}
