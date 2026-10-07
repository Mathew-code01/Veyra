// ============================================================================
// FILE: core/reliability/errors/FailureClassifier.ts
//
// PURPOSE:
// Converts unknown errors into predictable operational classifications.
//
// IMPORTANT:
// Classification does not decide recovery by itself.
// RetryManager and RecoveryManager make those decisions.
// ============================================================================

import {
  RELIABILITY_FAILURE_CODES,
  type ReliabilityFailureCode,
} from "./FailureCodes";

import { ReliabilityError } from "./ReliabilityError";

export interface FailureInput {
  readonly error: unknown;
  readonly operationId?: string;
  readonly componentId?: string;
  readonly attempt?: number;
}

export interface FailureClassification {
  readonly code: ReliabilityFailureCode;
  readonly retryable: boolean;
  readonly transient: boolean;
  readonly cancelled: boolean;
  readonly timedOut: boolean;
  readonly rateLimited: boolean;
  readonly dependencyFailure: boolean;
  readonly message: string;
  readonly retryAfterMs?: number;
}

export class FailureClassifier {
  public classify(input: FailureInput): FailureClassification {
    const normalized = ReliabilityError.fromUnknown(
      input.error,
      RELIABILITY_FAILURE_CODES.UNKNOWN,
      {
        operationId: input.operationId,
        componentId: input.componentId,
        attempt: input.attempt,
      },
    );

    const code = normalized.code;

    return Object.freeze({
      code,
      retryable: normalized.retryable,
      transient:
        code === RELIABILITY_FAILURE_CODES.TRANSIENT ||
        code === RELIABILITY_FAILURE_CODES.NETWORK ||
        code === RELIABILITY_FAILURE_CODES.TIMEOUT ||
        code === RELIABILITY_FAILURE_CODES.UNAVAILABLE ||
        code === RELIABILITY_FAILURE_CODES.RATE_LIMITED,

      cancelled: code === RELIABILITY_FAILURE_CODES.CANCELLATION,

      timedOut: code === RELIABILITY_FAILURE_CODES.TIMEOUT,

      rateLimited: code === RELIABILITY_FAILURE_CODES.RATE_LIMITED,

      dependencyFailure:
        code === RELIABILITY_FAILURE_CODES.DEPENDENCY ||
        code === RELIABILITY_FAILURE_CODES.UNAVAILABLE,

      message: normalized.message,

      retryAfterMs: normalized.details.retryAfterMs,
    });
  }
}
