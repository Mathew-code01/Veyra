// core/reliability/FallbackManager.ts

export interface FallbackAttempt<T> {
  readonly name: string;
  readonly execute: () => Promise<T>;
}

export interface FallbackError {
  readonly provider: string;
  readonly error: unknown;
  readonly durationMs: number;
}

export interface FallbackResult<T> {
  readonly value: T;
  readonly provider: string;
  readonly attempts: number;
  readonly errors: readonly FallbackError[];
  readonly totalDurationMs: number;
}

export class FallbackManager {
  public async execute<T>(
    attempts: readonly FallbackAttempt<T>[],
  ): Promise<FallbackResult<T>> {
    if (attempts.length === 0) {
      throw new FallbackManagerError(
        "NO_PROVIDERS",
        "No fallback providers configured.",
      );
    }

    const errors: FallbackError[] = [];
    const startedAt = performance.now();

    for (let index = 0; index < attempts.length; index++) {
      const attempt = attempts[index];

      if (!attempt || typeof attempt.execute !== "function") {
        errors.push({
          provider: attempt?.name ?? `provider-${index + 1}`,
          error: new Error("Invalid fallback provider."),
          durationMs: 0,
        });

        continue;
      }

      const attemptStartedAt = performance.now();

      try {
        const value = await attempt.execute();

        return {
          value,
          provider: attempt.name,
          attempts: index + 1,
          errors,
          totalDurationMs: performance.now() - startedAt,
        };
      } catch (error) {
        errors.push({
          provider: attempt.name,
          error,
          durationMs: performance.now() - attemptStartedAt,
        });
      }
    }

    throw new FallbackManagerError(
      "ALL_PROVIDERS_FAILED",
      "All configured fallback providers failed.",
      errors,
    );
  }
}

export class FallbackManagerError extends AggregateError {
  public readonly code: "NO_PROVIDERS" | "ALL_PROVIDERS_FAILED";

  public readonly failures: readonly FallbackError[];

  public constructor(
    code: "NO_PROVIDERS" | "ALL_PROVIDERS_FAILED",
    message: string,
    failures: readonly FallbackError[] = [],
  ) {
    super(
      failures.map((failure) => failure.error),
      message,
    );

    this.name = "FallbackManagerError";

    this.code = code;
    this.failures = failures;
  }
}
