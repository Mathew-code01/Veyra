// ============================================================================
// FILE: core/reliability/timeout/TimeoutPolicy.ts
//
// PURPOSE:
// Defines operation timeout behavior.
// ============================================================================

export interface TimeoutPolicy {
  readonly timeoutMs: number;
  readonly message?: string;
}

export const DEFAULT_TIMEOUT_POLICY: TimeoutPolicy = Object.freeze({
  timeoutMs: 30_000,
  message: "The operation exceeded its allowed execution time.",
});

export function resolveTimeout(policy?: TimeoutPolicy): number {
  return Math.max(1, policy?.timeoutMs ?? DEFAULT_TIMEOUT_POLICY.timeoutMs);
}
