// ============================================================================
// FILE: core/reliability/timeout/TimeoutManager.ts
//
// PURPOSE:
// Provides timeout enforcement around asynchronous operations.
// ============================================================================

import { ReliabilityError } from "../errors/ReliabilityError";

import { resolveTimeout, type TimeoutPolicy } from "./TimeoutPolicy";

export class TimeoutManager {
  public async execute<T>(
    operation: () => Promise<T>,
    policy: TimeoutPolicy,
    signal?: AbortSignal,
  ): Promise<T> {
    const timeoutMs = resolveTimeout(policy);

    if (signal?.aborted) {
      throw ReliabilityError.cancelled();
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        clearTimeout(timer);

        signal?.removeEventListener("abort", onAbort);
      };

      const succeed = (value: T): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(value);
      };

      const fail = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      };

      const onAbort = (): void => {
        fail(ReliabilityError.cancelled());
      };

      const timer = setTimeout(() => {
        fail(ReliabilityError.timeout(policy.message));
      }, timeoutMs);

      signal?.addEventListener("abort", onAbort, { once: true });

      void operation().then(succeed, fail);
    });
  }
}
