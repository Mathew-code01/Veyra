// ============================================================================
// FILE: core/reliability/recovery/RecoveryAction.ts
//
// PURPOSE:
// Describes actions that may be taken when an operation fails.
//
// Actions are descriptors. RecoveryManager decides whether to execute them.
// ============================================================================

export type RecoveryActionType =
  | "retry"
  | "refresh-health"
  | "reset-circuit"
  | "fallback"
  | "reinitialize"
  | "abort"
  | "fail";

export interface RecoveryAction {
  readonly type: RecoveryActionType;
  readonly priority: number;
  readonly description: string;
  readonly execute?: (signal?: AbortSignal) => Promise<void>;
}
