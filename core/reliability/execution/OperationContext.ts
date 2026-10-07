// ============================================================================
// FILE: core/reliability/execution/OperationContext.ts
//
// PURPOSE:
// Carries lifecycle information for one reliability-managed operation.
//
// This is deliberately generic so AI, audio, documents, context, models,
// vision, etc. can all use it.
// ============================================================================

import type { OperationState } from "./OperationState";

export interface OperationExecutionOptions {
  readonly operationId?: string;
  readonly componentId: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;

  readonly metadata?: Readonly<Record<string, string>>;
}

export interface OperationContext {
  readonly operationId: string;
  readonly componentId: string;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly state: OperationState;
  readonly attempt: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export function createOperationId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
