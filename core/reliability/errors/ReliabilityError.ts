// ============================================================================
// FILE: core/reliability/errors/ReliabilityError.ts
//
// PURPOSE:
// Canonical reliability error.
//
// ReliabilityError normalizes operational failures so retry, recovery,
// timeout, circuit, and execution layers can reason about them consistently.
// ============================================================================

import {
  RELIABILITY_FAILURE_CODES,
  type ReliabilityFailureCode,
} from "./FailureCodes";

export interface ReliabilityErrorDetails {
  readonly operationId?: string;
  readonly componentId?: string;
  readonly attempt?: number;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, string>>;
}

export class ReliabilityError extends Error {
  public readonly code: ReliabilityFailureCode;
  public readonly details: ReliabilityErrorDetails;

  public constructor(
    message: string,
    code: ReliabilityFailureCode = RELIABILITY_FAILURE_CODES.UNKNOWN,
    details: ReliabilityErrorDetails = {},
  ) {
    super(message);

    this.name = "ReliabilityError";
    this.code = code;
    this.details = Object.freeze({
      ...details,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public get retryable(): boolean {
    return this.details.retryable === true;
  }

  public static fromUnknown(
    error: unknown,
    fallbackCode: ReliabilityFailureCode = RELIABILITY_FAILURE_CODES.UNKNOWN,
    details: ReliabilityErrorDetails = {},
  ): ReliabilityError {
    if (error instanceof ReliabilityError) {
      return new ReliabilityError(error.message, error.code, {
        ...error.details,
        ...details,
      });
    }

    if (error instanceof Error) {
      return new ReliabilityError(error.message, fallbackCode, {
        ...details,
        cause: error,
      });
    }

    return new ReliabilityError(String(error), fallbackCode, {
      ...details,
      cause: error,
    });
  }

  public static timeout(
    message = "The operation timed out.",
    details: ReliabilityErrorDetails = {},
  ): ReliabilityError {
    return new ReliabilityError(message, RELIABILITY_FAILURE_CODES.TIMEOUT, {
      ...details,
      retryable: details.retryable ?? true,
    });
  }

  public static cancelled(
    message = "The operation was cancelled.",
    details: ReliabilityErrorDetails = {},
  ): ReliabilityError {
    return new ReliabilityError(
      message,
      RELIABILITY_FAILURE_CODES.CANCELLATION,
      {
        ...details,
        retryable: false,
      },
    );
  }

  public static unavailable(
    message = "The dependency is unavailable.",
    details: ReliabilityErrorDetails = {},
  ): ReliabilityError {
    return new ReliabilityError(
      message,
      RELIABILITY_FAILURE_CODES.UNAVAILABLE,
      {
        ...details,
        retryable: details.retryable ?? true,
      },
    );
  }

  public static circuitOpen(
    message = "The circuit breaker is open.",
    details: ReliabilityErrorDetails = {},
  ): ReliabilityError {
    return new ReliabilityError(
      message,
      RELIABILITY_FAILURE_CODES.CIRCUIT_OPEN,
      {
        ...details,
        retryable: false,
      },
    );
  }
}
