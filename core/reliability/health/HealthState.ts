// ============================================================================
// FILE: core/reliability/health/HealthState.ts
//
// PURPOSE:
// Canonical health states.
//
// Health describes availability/condition, not business correctness.
// ============================================================================

export const HEALTH_STATES = Object.freeze({
  UNKNOWN: "unknown",
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
  RECOVERING: "recovering",
} as const);

export type HealthState =
  (typeof HEALTH_STATES)[keyof typeof HEALTH_STATES];

export function isHealthyState(
  state: HealthState,
): boolean {
  return state === HEALTH_STATES.HEALTHY;
}

export function isAvailableState(
  state: HealthState,
): boolean {
  return (
    state === HEALTH_STATES.HEALTHY ||
    state === HEALTH_STATES.DEGRADED
  );
}