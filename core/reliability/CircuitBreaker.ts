// core/reliability/CircuitBreaker.ts

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";

  private failures = 0;
  private openedAt = 0;
  private halfOpenCalls = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxCalls: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);

    this.resetTimeoutMs = Math.max(100, options.resetTimeoutMs ?? 30_000);

    this.halfOpenMaxCalls = Math.max(1, options.halfOpenMaxCalls ?? 1);
  }

  getState(): CircuitState {
    this.refreshState();
    return this.state;
  }

  private refreshState(): void {
    if (
      this.state === "open" &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.state = "half-open";
      this.halfOpenCalls = 0;
    }
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.refreshState();

    if (this.state === "open") {
      throw new Error("Circuit breaker is open.");
    }

    if (
      this.state === "half-open" &&
      this.halfOpenCalls >= this.halfOpenMaxCalls
    ) {
      throw new Error("Circuit breaker is probing recovery.");
    }

    if (this.state === "half-open") {
      this.halfOpenCalls++;
    }

    try {
      const result = await operation();

      this.recordSuccess();

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.halfOpenCalls = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures++;

    if (this.state === "half-open" || this.failures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
      this.halfOpenCalls = 0;
    }
  }

  reset(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.halfOpenCalls = 0;
    this.state = "closed";
  }
}