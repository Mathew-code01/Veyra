
// ============================================================================
// FILE: core/interview/errors/InterviewError.ts
//
// PURPOSE:
// Canonical error model for the Interview domain.
// ============================================================================

export type InterviewErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_CONVERSATION"
  | "INVALID_CLASSIFICATION"
  | "TASK_CREATION_FAILED"
  | "ANSWER_BUILD_FAILED"
  | "CANDIDATE_LOOKUP_FAILED"
  | "CONTEXT_LOOKUP_FAILED"
  | "ENGINE_FAILURE"
  | "UNSUPPORTED_TASK"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export type InterviewErrorStage =
  | "validation"
  | "classification"
  | "task"
  | "answer"
  | "candidate"
  | "context"
  | "engine"
  | "service";

export interface InterviewErrorDetails {
  readonly stage?: InterviewErrorStage;

  readonly cause?: unknown;

  readonly candidateId?: string;

  readonly sessionId?: string;

  readonly turnId?: string;

  readonly segmentId?: string;

  readonly interviewType?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class InterviewError extends Error {
  public readonly code: InterviewErrorCode;

  public readonly details: InterviewErrorDetails;

  public constructor(
    code: InterviewErrorCode,
    message: string,
    details: InterviewErrorDetails = {},
  ) {
    super(message);

    this.name = "InterviewError";

    this.code = code;

    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static invalidRequest(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("INVALID_REQUEST", message, {
      ...details,
      stage: "validation",
    });
  }

  public static invalidConversation(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("INVALID_CONVERSATION", message, {
      ...details,
      stage: "validation",
    });
  }

  public static classificationFailure(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("INVALID_CLASSIFICATION", message, {
      ...details,
      stage: "classification",
    });
  }

  public static taskFailure(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("TASK_CREATION_FAILED", message, {
      ...details,
      stage: "task",
    });
  }

  public static answerFailure(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("ANSWER_BUILD_FAILED", message, {
      ...details,
      stage: "answer",
    });
  }

  public static candidateFailure(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("CANDIDATE_LOOKUP_FAILED", message, {
      ...details,
      stage: "candidate",
    });
  }

  public static contextFailure(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("CONTEXT_LOOKUP_FAILED", message, {
      ...details,
      stage: "context",
    });
  }

  public static engineFailure(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("ENGINE_FAILURE", message, {
      ...details,
      stage: "engine",
    });
  }

  public static unsupported(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("UNSUPPORTED_TASK", message, {
      ...details,
      stage: "engine",
    });
  }

  public static cancelled(
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError(
      "CANCELLED",
      "Interview operation was cancelled.",
      details,
    );
  }

  public static internal(
    message: string,
    details: InterviewErrorDetails = {},
  ): InterviewError {
    return new InterviewError("INTERNAL_ERROR", message, {
      ...details,
      stage: "service",
    });
  }
}
