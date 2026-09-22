// ============================================================================
// FILE: core/candidate/errors/CandidateError.ts
// PURPOSE:
// Canonical candidate-domain error representation.
//
// DESIGN PRINCIPLES:
// - Candidate errors are structured and machine-readable.
// - Errors preserve the domain stage that produced them.
// - Unknown errors can be safely normalized.
// - Existing CandidateError instances are never double-wrapped.
// - Error causes are preserved for diagnostics.
// - Error details remain readonly to consumers.
// ============================================================================

export type CandidateErrorCode =
  | "CANDIDATE_INVALID_REQUEST"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_ALREADY_EXISTS"
  | "CANDIDATE_INVALID_PROFILE"
  | "CANDIDATE_INVALID_EXPERIENCE"
  | "CANDIDATE_INVALID_PROJECT"
  | "CANDIDATE_INVALID_SKILL"
  | "CANDIDATE_INVALID_STORY"
  | "CANDIDATE_INVALID_EVIDENCE"
  | "CANDIDATE_CONTEXT_BUILD_FAILED"
  | "CANDIDATE_EVIDENCE_RETRIEVAL_FAILED"
  | "CANDIDATE_STORE_FAILED"
  | "CANDIDATE_CONFLICT"
  | "CANDIDATE_CANCELLED"
  | "CANDIDATE_INTERNAL_ERROR";

export type CandidateErrorStage =
  | "validation"
  | "profile"
  | "experience"
  | "project"
  | "skill"
  | "story"
  | "evidence"
  | "context"
  | "retrieval"
  | "store"
  | "internal";

export interface CandidateErrorDetails {
  readonly stage?: CandidateErrorStage;
  readonly candidateId?: string;
  readonly recordId?: string;
  readonly cause?: unknown;
  readonly reasons?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export class CandidateError extends Error {
  public readonly code: CandidateErrorCode;

  public readonly stage: CandidateErrorStage;

  public readonly details: CandidateErrorDetails;

  public readonly cause?: unknown;

  public constructor(
    code: CandidateErrorCode,
    message: string,
    stage: CandidateErrorStage,
    details: CandidateErrorDetails = {},
  ) {
    super(message, {
      cause: details.cause,
    });

    this.name = "CandidateError";
    this.code = code;
    this.stage = stage;
    this.details = Object.freeze({
      ...details,
    });
    this.cause = details.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static invalidRequest(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_INVALID_REQUEST",
      message,
      "validation",
      details,
    );
  }

  public static notFound(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_NOT_FOUND",
      message,
      details.stage ?? "internal",
      details,
    );
  }

  public static alreadyExists(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_ALREADY_EXISTS",
      message,
      details.stage ?? "store",
      details,
    );
  }

  public static conflict(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_CONFLICT",
      message,
      details.stage ?? "store",
      details,
    );
  }

  public static cancelled(candidateId?: string): CandidateError {
    return new CandidateError(
      "CANDIDATE_CANCELLED",
      "Candidate operation was cancelled.",
      "internal",
      {
        candidateId,
      },
    );
  }

  public static fromUnknown(
    error: unknown,
    stage: CandidateErrorStage = "internal",
    details: Omit<CandidateErrorDetails, "cause" | "stage"> = {},
  ): CandidateError {
    if (error instanceof CandidateError) {
      return error;
    }

    const message =
      error instanceof Error && error.message
        ? error.message
        : "An unexpected candidate error occurred.";

    return new CandidateError("CANDIDATE_INTERNAL_ERROR", message, stage, {
      ...details,
      cause: error,
    });
  }

  public static storeFailure(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_STORE_FAILED",
      message,
      "store",
      details,
    );
  }

  public static contextBuildFailure(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_CONTEXT_BUILD_FAILED",
      message,
      "context",
      details,
    );
  }

  public static retrievalFailure(
    message: string,
    details: CandidateErrorDetails = {},
  ): CandidateError {
    return new CandidateError(
      "CANDIDATE_EVIDENCE_RETRIEVAL_FAILED",
      message,
      "retrieval",
      details,
    );
  }
}

export function assertCandidateCondition(
  condition: unknown,
  message: string,
  details: CandidateErrorDetails = {},
): asserts condition {
  if (!condition) {
    throw CandidateError.invalidRequest(message, details);
  }
}
