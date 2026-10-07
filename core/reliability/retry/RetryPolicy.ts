// ============================================================================
// FILE: core/reliability/retry/RetryPolicy.ts
//
// PURPOSE:
// Defines retry rules.
//
// Retry is explicitly policy-driven.
// ============================================================================

import type { FailureClassification } from "../errors/FailureClassifier";

import { FailureClassifier } from "../errors/FailureClassifier";

import { BackoffStrategy, type BackoffOptions } from "./BackoffStrategy";

// ============================================================================
// RETRY POLICY
// ============================================================================

export interface RetryPolicy {
  readonly maxAttempts: number;

  readonly backoff?: BackoffOptions;

  readonly retryableCodes?: readonly string[];

  readonly retryOnTransient?: boolean;

  readonly retryOnTimeout?: boolean;

  readonly retryOnNetworkError?: boolean;

  readonly retryOnRateLimit?: boolean;

  readonly shouldRetry?: (
    classification: FailureClassification,
    attempt: number,
  ) => boolean;
}

// ============================================================================
// RETRY DECISION
// ============================================================================

export interface RetryDecision {
  readonly retry: boolean;

  readonly attempt: number;

  readonly delayMs: number;

  readonly reason: string;
}

// ============================================================================
// DEFAULT RETRY POLICY
// ============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxAttempts: 3,

  backoff: Object.freeze({
    strategy: "exponential" as const,

    baseDelayMs: 250,

    maxDelayMs: 5_000,

    jitterRatio: 0.1,
  }),

  retryOnTransient: true,

  retryOnTimeout: true,

  retryOnNetworkError: true,

  retryOnRateLimit: true,
});

// ============================================================================
// RETRY POLICY EVALUATOR
// ============================================================================

export class RetryPolicyEvaluator {
  private readonly classifier = new FailureClassifier();

  public decide(
    policy: RetryPolicy,
    attempt: number,
    error: unknown,
  ): RetryDecision {
    const classification = this.classifier.classify({
      error,
      attempt,
    });

    // ------------------------------------------------------------------------
    // MAX ATTEMPTS
    // ------------------------------------------------------------------------

    if (attempt >= Math.max(1, policy.maxAttempts)) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Maximum retry attempts reached.",
      });
    }

    // ------------------------------------------------------------------------
    // CUSTOM POLICY
    // ------------------------------------------------------------------------

    if (policy.shouldRetry && !policy.shouldRetry(classification, attempt)) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Retry policy rejected the failure.",
      });
    }

    // ------------------------------------------------------------------------
    // CLASSIFICATION
    // ------------------------------------------------------------------------

    if (!classification.retryable) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Failure is not classified as retryable.",
      });
    }

    // ------------------------------------------------------------------------
    // TIMEOUT
    // ------------------------------------------------------------------------

    if (classification.timedOut && policy.retryOnTimeout === false) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Timeout retries are disabled.",
      });
    }

    // ------------------------------------------------------------------------
    // TRANSIENT
    // ------------------------------------------------------------------------

    if (classification.transient && policy.retryOnTransient === false) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Transient retries are disabled.",
      });
    }

    // ------------------------------------------------------------------------
    // RATE LIMIT
    // ------------------------------------------------------------------------

    if (classification.rateLimited && policy.retryOnRateLimit === false) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Rate-limit retries are disabled.",
      });
    }

    // ------------------------------------------------------------------------
    // NETWORK
    // ------------------------------------------------------------------------

    if (
      classification.code === "reliability.network" &&
      policy.retryOnNetworkError === false
    ) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Network retries are disabled.",
      });
    }

    // ------------------------------------------------------------------------
    // EXPLICIT RETRYABLE CODES
    // ------------------------------------------------------------------------

    if (
      policy.retryableCodes &&
      !policy.retryableCodes.includes(classification.code)
    ) {
      return Object.freeze({
        retry: false,

        attempt,

        delayMs: 0,

        reason: "Failure code is not included in retryableCodes.",
      });
    }

    // ------------------------------------------------------------------------
    // BACKOFF
    // ------------------------------------------------------------------------

    const backoff = new BackoffStrategy(policy.backoff);

    const delayMs = classification.retryAfterMs ?? backoff.getDelay(attempt);

    return Object.freeze({
      retry: true,

      attempt,

      delayMs,

      reason: "Failure is eligible for retry.",
    });
  }
}
