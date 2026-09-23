export type ConversationErrorCode =
  | "INVALID_SEGMENT"
  | "INVALID_STATE"
  | "ANALYSIS_FAILED"
  | "MEMORY_FAILURE"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export type ConversationErrorStage =
  | "validation"
  | "normalization"
  | "question"
  | "intent"
  | "follow_up"
  | "clarification"
  | "repetition"
  | "topic"
  | "analysis"
  | "memory"
  | "manager";

export interface ConversationErrorDetails {
  readonly stage?: ConversationErrorStage;
  readonly cause?: unknown;
  readonly sessionId?: string;
  readonly segmentId?: string;
}

export class ConversationError extends Error {
  readonly code: ConversationErrorCode;
  readonly details: ConversationErrorDetails;

  constructor(
    code: ConversationErrorCode,
    message: string,
    details: ConversationErrorDetails = {},
  ) {
    super(message);

    this.name = "ConversationError";
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  static invalidSegment(
    message: string,
    details: ConversationErrorDetails = {},
  ): ConversationError {
    return new ConversationError("INVALID_SEGMENT", message, {
      ...details,
      stage: "validation",
    });
  }

  static analysisFailed(
    message: string,
    details: ConversationErrorDetails = {},
  ): ConversationError {
    return new ConversationError("ANALYSIS_FAILED", message, {
      ...details,
      stage: "analysis",
    });
  }

  static memoryFailure(
    message: string,
    details: ConversationErrorDetails = {},
  ): ConversationError {
    return new ConversationError("MEMORY_FAILURE", message, {
      ...details,
      stage: "memory",
    });
  }

  static cancelled(details: ConversationErrorDetails = {}): ConversationError {
    return new ConversationError(
      "CANCELLED",
      "Conversation analysis was cancelled.",
      details,
    );
  }
}
