// ============================================================================
// FILE: core/reliability/circuit/CircuitBreakerPolicy.ts
//
// PURPOSE:
// Defines circuit breaker thresholds and recovery behavior.
// ============================================================================

export interface CircuitBreakerPolicy {
  readonly failureThreshold: number;
  readonly successThreshold: number;
  readonly resetTimeoutMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_POLICY: CircuitBreakerPolicy =
  Object.freeze({
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeoutMs: 30_000,
  });
