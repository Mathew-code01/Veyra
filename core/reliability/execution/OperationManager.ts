// ============================================================================
// FILE: core/reliability/execution/OperationManager.ts
//
// PURPOSE:
// Tracks the lifecycle of reliability-managed operations.
//
// OperationManager is deliberately separate from RetryManager and
// RecoveryManager.
//
// It answers:
// "What is happening to this operation?"
//
// It does not answer:
// "Should we retry it?"
// "How should AI route it?"
// "How should audio recover?"
// ============================================================================

import {
  createOperationId,
  type OperationContext,
  type OperationExecutionOptions,
} from "./OperationContext";

import { OPERATION_STATES, type OperationState } from "./OperationState";

export interface OperationRecord extends OperationContext {
  readonly error?: unknown;
}

export class OperationManager {
  private readonly operations = new Map<string, OperationRecord>();

  public create(options: OperationExecutionOptions): OperationContext {
    const operationId = options.operationId ?? createOperationId();

    if (this.operations.has(operationId)) {
      throw new Error(`Operation "${operationId}" already exists.`);
    }

    const operation: OperationRecord = Object.freeze({
      operationId,
      componentId: options.componentId,
      startedAt: Date.now(),
      state: OPERATION_STATES.CREATED,
      attempt: 0,
      metadata: Object.freeze({
        ...(options.metadata ?? {}),
      }),
    });

    this.operations.set(operationId, operation);

    return operation;
  }

  public transition(
    operationId: string,
    state: OperationState,
    attempt?: number,
    error?: unknown,
  ): OperationContext {
    const current = this.operations.get(operationId);

    if (!current) {
      throw new Error(`Operation "${operationId}" does not exist.`);
    }

    const completed =
      state === OPERATION_STATES.COMPLETED ||
      state === OPERATION_STATES.FAILED ||
      state === OPERATION_STATES.CANCELLED ||
      state === OPERATION_STATES.TIMED_OUT;

    const next: OperationRecord = Object.freeze({
      ...current,
      state,
      attempt: attempt ?? current.attempt,
      completedAt: completed ? Date.now() : current.completedAt,
      error,
    });

    this.operations.set(operationId, next);

    return next;
  }

  public get(operationId: string): OperationContext | undefined {
    return this.operations.get(operationId);
  }

  public list(): readonly OperationContext[] {
    return Object.freeze([...this.operations.values()]);
  }

  public remove(operationId: string): boolean {
    return this.operations.delete(operationId);
  }

  public clearCompleted(): void {
    for (const [operationId, operation] of this.operations) {
      if (
        operation.state === OPERATION_STATES.COMPLETED ||
        operation.state === OPERATION_STATES.FAILED ||
        operation.state === OPERATION_STATES.CANCELLED ||
        operation.state === OPERATION_STATES.TIMED_OUT
      ) {
        this.operations.delete(operationId);
      }
    }
  }
}
