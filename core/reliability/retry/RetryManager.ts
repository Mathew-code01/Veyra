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
// ============================================================================

import {
  RetryPolicyEvaluator,
  type RetryDecision,
  type RetryPolicy,
} from "./RetryPolicy";

export interface RetryExecutionResult<T> {
  readonly value?: T;
  readonly error?: unknown;
  readonly attempts: number;
  readonly retried: boolean;
  readonly succeeded: boolean;
}

export class RetryManager {
  private readonly evaluator = new RetryPolicyEvaluator();

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

  public async execute<T>(
    operation: (attempt: number) => Promise<T>,
    policy: RetryPolicy,
    signal?: AbortSignal,
  ): Promise<RetryExecutionResult<T>> {
    let attempt = 0;
    let retried = false;
    let lastError: unknown;

    while (attempt < Math.max(1, policy.maxAttempts)) {
      if (signal?.aborted) {
        return Object.freeze({
          error: new DOMException("Operation aborted.", "AbortError"),
          attempts: attempt,
          retried,
          succeeded: false,
        });
      }

      attempt += 1;

      try {
        const value = await operation(attempt);

        return Object.freeze({
          value,
          attempts: attempt,
          retried,
          succeeded: true,
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

    return Object.freeze({
      error: lastError,
      attempts: attempt,
      retried,
      succeeded: false,
    });
  }

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
