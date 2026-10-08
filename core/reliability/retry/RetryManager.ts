// ============================================================================
// FILE: core/reliability/retry/RetryManager.ts
//
// PURPOSE:
// Executes retry policy decisions.
//
// RetryManager owns:
// - retry decision evaluation
// - delay
// - retry attempt counting
//
// It does NOT own:
// - business logic
// - AI routing
// - provider selection
// - recovery policy
//
// IMPORTANT TYPE DESIGN:
// RetryExecutionResult is deliberately a discriminated union.
//
// When succeeded === true:
//   value is guaranteed to exist as a property.
//
// When succeeded === false:
//   error is guaranteed to exist as a property.
//
// This allows callers to safely narrow the result without using
// non-null assertions or unsafe casts.
//
// ============================================================================

import {
  RetryPolicyEvaluator,
  type RetryDecision,
  type RetryPolicy,
} from "./RetryPolicy";

// ============================================================================
// Successful retry execution
// ============================================================================

export interface RetryExecutionSuccess<T> {
  readonly succeeded: true;

  /**
   * Result produced by the successful operation.
   *
   * T may itself be void. Therefore the property exists even when
   * the runtime value is undefined.
   */
  readonly value: T;

  readonly attempts: number;

  readonly retried: boolean;
}

// ============================================================================
// Failed retry execution
// ============================================================================

export interface RetryExecutionFailure {
  readonly succeeded: false;

  /**
   * The final error produced by the operation.
   *
   * This may be undefined in an extremely unusual case where the
   * retry loop is never entered, but the normal execution path
   * always supplies the final operation error.
   */
  readonly error: unknown;

  readonly attempts: number;

  readonly retried: boolean;
}

// ============================================================================
// Retry execution result
// ============================================================================

export type RetryExecutionResult<T> =
  RetryExecutionSuccess<T> | RetryExecutionFailure;

// ============================================================================
// Retry manager
// ============================================================================

export class RetryManager {
  private readonly evaluator = new RetryPolicyEvaluator();

  // ========================================================================
  // Retry decision
  // ========================================================================

  public decide(
    policy: RetryPolicy,
    attempt: number,
    error: unknown,
  ): RetryDecision {
    return this.evaluator.decide(policy, attempt, error);
  }

  public shouldRetry(
    policy: RetryPolicy,
    attempt: number,
    error: unknown,
  ): boolean {
    return this.decide(policy, attempt, error).retry;
  }

  // ========================================================================
  // Execute
  // ========================================================================

  public async execute<T>(
    operation: (attempt: number) => Promise<T>,
    policy: RetryPolicy,
    signal?: AbortSignal,
  ): Promise<RetryExecutionResult<T>> {
    let attempt = 0;

    let retried = false;

    let lastError: unknown;

    while (attempt < Math.max(1, policy.maxAttempts)) {
      // --------------------------------------------------------------------
      // Cancellation before starting the next attempt
      // --------------------------------------------------------------------

      if (signal?.aborted) {
        return Object.freeze({
          succeeded: false as const,

          error: new DOMException("Operation aborted.", "AbortError"),

          attempts: attempt,

          retried,
        });
      }

      attempt += 1;

      // --------------------------------------------------------------------
      // Execute operation
      // --------------------------------------------------------------------

      try {
        const value = await operation(attempt);

        return Object.freeze({
          succeeded: true as const,

          value,

          attempts: attempt,

          retried,
        });
      } catch (error) {
        lastError = error;

        const decision = this.decide(policy, attempt, error);

        if (!decision.retry) {
          break;
        }

        retried = true;

        await this.delay(decision.delayMs, signal);
      }
    }

    // ----------------------------------------------------------------------
    // Final failure
    // ----------------------------------------------------------------------

    return Object.freeze({
      succeeded: false as const,

      error: lastError,

      attempts: attempt,

      retried,
    });
  }

  // ========================================================================
  // Delay
  // ========================================================================

  private async delay(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (delayMs <= 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;

      const onAbort = (): void => {
        clearTimeout(timer);

        reject(new DOMException("Operation aborted.", "AbortError"));
      };

      timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);

        resolve();
      }, delayMs);

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
