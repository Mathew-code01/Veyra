// ============================================================================
// FILE: core/reliability/execution/OperationState.ts
//
// PURPOSE:
// Lifecycle states for reliability-managed operations.
// ============================================================================

export const OPERATION_STATES = Object.freeze({
  CREATED: "created",
  STARTING: "starting",
  RUNNING: "running",
  RETRYING: "retrying",
  RECOVERING: "recovering",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  TIMED_OUT: "timed_out",
} as const);

export type OperationState =
  (typeof OPERATION_STATES)[keyof typeof OPERATION_STATES];
