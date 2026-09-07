// core/reliability/RetryManager.ts

import { AIError } from "../ai/AIError";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (
    error: unknown,
    attempt: number,
    delayMs: number,
  ) => void | Promise<void>;
}

export class RetryManager {
  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 3);

    const baseDelay = Math.max(0, options.baseDelayMs ?? 250);

    const maxDelay = Math.max(baseDelay, options.maxDelayMs ?? 5000);

    const jitter = Math.max(0, options.jitter ?? 0.2);

    const shouldRetry =
      options.shouldRetry ??
      ((error) => (error instanceof AIError ? error.retryable : false));

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;

        if (attempt >= maxAttempts || !shouldRetry(error)) {
          throw error;
        }

        const exponential = Math.min(
          maxDelay,
          baseDelay * Math.pow(2, attempt - 1),
        );

        const variation = exponential * jitter;

        const delay = Math.max(
          0,
          exponential + (Math.random() * 2 - 1) * variation,
        );

        await options.onRetry?.(error, attempt, Math.round(delay));

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}