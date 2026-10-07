// ============================================================================
// FILE: core/reliability/retry/BackoffStrategy.ts
//
// PURPOSE:
// Calculates delay between retry attempts.
//
// Strategies are pure calculations.
// They do not sleep or execute operations.
// ============================================================================

export type BackoffStrategyName = "none" | "fixed" | "linear" | "exponential";

export interface BackoffOptions {
  readonly strategy?: BackoffStrategyName;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly jitterRatio?: number;
}

export class BackoffStrategy {
  private readonly strategy: BackoffStrategyName;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterRatio: number;

  public constructor(options: BackoffOptions = {}) {
    this.strategy = options.strategy ?? "exponential";

    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);

    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 30_000);

    this.jitterRatio = Math.min(1, Math.max(0, options.jitterRatio ?? 0.1));
  }

  public getDelay(attempt: number): number {
    const safeAttempt = Math.max(1, Math.floor(attempt));

    let delay: number;

    switch (this.strategy) {
      case "none":
        delay = 0;
        break;

      case "fixed":
        delay = this.baseDelayMs;
        break;

      case "linear":
        delay = this.baseDelayMs * safeAttempt;
        break;

      case "exponential":
      default:
        delay = this.baseDelayMs * 2 ** (safeAttempt - 1);
        break;
    }

    delay = Math.min(this.maxDelayMs, delay);

    if (this.jitterRatio === 0) {
      return Math.round(delay);
    }

    const spread = delay * this.jitterRatio;

    const jitter = (Math.random() * 2 - 1) * spread;

    return Math.max(0, Math.round(delay + jitter));
  }
}
