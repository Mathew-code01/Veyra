// core/reliability/TimeoutManager.ts

import { AIError } from "../ai/AIError";

export class TimeoutManager {
  async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new AIError(
        "Timeout must be greater than zero.",
        "INVALID_REQUEST",
      );
    }

    const controller = new AbortController();

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const abortParent = () => {
      controller.abort();
    };

    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentSignal.addEventListener("abort", abortParent, { once: true });
      }
    }

    try {
      return await operation(controller.signal);
    } catch (error) {
      if (timedOut) {
        throw new AIError(
          `Operation timed out after ${timeoutMs}ms.`,
          "TIMEOUT",
          {
            retryable: true,
            details: {
              cause: error,
            },
          },
        );
      }

      if (parentSignal?.aborted) {
        throw new AIError("Operation was aborted by the caller.", "ABORTED", {
          retryable: false,
          details: {
            cause: error,
          },
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);

      parentSignal?.removeEventListener("abort", abortParent);
    }
  }
}