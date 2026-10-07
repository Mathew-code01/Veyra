// ============================================================================
// FILE: core/reliability/circuit/CircuitState.ts
//
// PURPOSE:
// Circuit breaker states.
// ============================================================================

export const CIRCUIT_STATES = Object.freeze({
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half_open",
} as const);

export type CircuitState = (typeof CIRCUIT_STATES)[keyof typeof CIRCUIT_STATES];
