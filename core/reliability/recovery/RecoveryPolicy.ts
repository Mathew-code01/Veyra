// ============================================================================
// FILE: core/reliability/recovery/RecoveryPolicy.ts
//
// PURPOSE:
// Controls which recovery actions are allowed.
// ============================================================================

import type { RecoveryActionType } from "./RecoveryAction";

export interface RecoveryPolicy {
  readonly actions: readonly RecoveryActionType[];

  readonly allowRetry?: boolean;
  readonly allowFallback?: boolean;
  readonly allowReinitialize?: boolean;
  readonly allowHealthRefresh?: boolean;
  readonly allowCircuitReset?: boolean;
}

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = Object.freeze({
  actions: Object.freeze([
    "refresh-health",
    "retry",
    "fallback",
    "reinitialize",
    "fail",
  ]),
  allowRetry: true,
  allowFallback: true,
  allowReinitialize: true,
  allowHealthRefresh: true,
  allowCircuitReset: false,
});
