// ============================================================================
// FILE: core/reliability/circuit/CircuitBreaker.ts
//
// PURPOSE:
// Prevents repeated calls to a dependency that is consistently failing.
//
// STATES:
// CLOSED
//    ↓ failures exceed threshold
// OPEN
//    ↓ reset timeout
// HALF_OPEN
//    ↓ successful probes
// CLOSED
// ============================================================================

import { ReliabilityError } from "../errors/ReliabilityError";

import { CIRCUIT_STATES, type CircuitState } from "./CircuitState";

import {
  DEFAULT_CIRCUIT_BREAKER_POLICY,
  type CircuitBreakerPolicy,
} from "./CircuitBreakerPolicy";

export class CircuitBreaker {
  private state: CircuitState = CIRCUIT_STATES.CLOSED;

  private failureCount = 0;
  private successCount = 0;
  private openedAt?: number;

  private readonly policy: CircuitBreakerPolicy;

  public constructor(
    policy: CircuitBreakerPolicy = DEFAULT_CIRCUIT_BREAKER_POLICY,
  ) {
    this.policy = Object.freeze({
      ...policy,
      failureThreshold: Math.max(1, policy.failureThreshold),
      successThreshold: Math.max(1, policy.successThreshold),
      resetTimeoutMs: Math.max(0, policy.resetTimeoutMs),
    });
  }

  public getState(): CircuitState {
    this.refreshState();

    return this.state;
  }

  public canExecute(): boolean {
    return this.getState() !== CIRCUIT_STATES.OPEN;
  }

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw ReliabilityError.circuitOpen();
    }

    try {
      const value = await operation();

      this.recordSuccess();

      return value;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  public recordSuccess(): void {
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.successCount += 1;

      if (this.successCount >= this.policy.successThreshold) {
        this.close();
      }

      return;
    }

    this.failureCount = 0;
  }

  public recordFailure(): void {
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.open();
      return;
    }

    this.failureCount += 1;

    if (this.failureCount >= this.policy.failureThreshold) {
      this.open();
    }
  }

  public open(): void {
    this.state = CIRCUIT_STATES.OPEN;

    this.openedAt = Date.now();
    this.successCount = 0;
  }

  public close(): void {
    this.state = CIRCUIT_STATES.CLOSED;

    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = undefined;
  }

  public halfOpen(): void {
    this.state = CIRCUIT_STATES.HALF_OPEN;

    this.successCount = 0;
  }

  private refreshState(): void {
    if (this.state !== CIRCUIT_STATES.OPEN) {
      return;
    }

    if (this.openedAt === undefined) {
      return;
    }

    if (Date.now() - this.openedAt >= this.policy.resetTimeoutMs) {
      this.halfOpen();
    }
  }
}
