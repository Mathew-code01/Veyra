// ============================================================================
// FILE: core/reliability/ReliabilityManager.ts
//
// PURPOSE:
// Public orchestration facade for Veyra reliability.
//
// CORE QUESTION:
// "How do we keep operations reliable when things fail?"
//
// RESPONSIBILITIES:
// - Create operation lifecycle.
// - Enforce timeout.
// - Apply retry policy.
// - Coordinate recovery.
// - Normalize failures.
// - Return deterministic operation results.
//
// DOES NOT:
// - route AI
// - choose providers
// - build prompts
// - process audio
// - classify interview questions
// - manipulate documents
// - implement business logic
//
// Those concerns remain in their respective core subsystems.
//
// ============================================================================

import {
  FailureClassifier,
  type FailureClassification,
} from "./errors/FailureClassifier";

import { ReliabilityError } from "./errors/ReliabilityError";

import { HealthManager } from "./health/HealthManager";

import {
  type HealthCheckRequest,
  type HealthStatus,
} from "./health/HealthCheck";

import {
  RecoveryManager,
  type RecoveryContext,
  type RecoveryResult,
} from "./recovery/RecoveryManager";

import { RetryManager, type RetryExecutionResult } from "./retry/RetryManager";

import {
  DEFAULT_RETRY_POLICY,
  type RetryPolicy,
  type RetryDecision,
} from "./retry/RetryPolicy";

import { TimeoutManager } from "./timeout/TimeoutManager";

import { DEFAULT_TIMEOUT_POLICY } from "./timeout/TimeoutPolicy";

import {
  OperationManager,
  type OperationRecord,
} from "./execution/OperationManager";

import type {
  OperationContext,
  OperationExecutionOptions,
} from "./execution/OperationContext";

import { OPERATION_STATES } from "./execution/OperationState";

import type { ReliabilityExecutionResult } from "./contracts/ReliabilityContract";

// ============================================================================
// Reliable execution options
// ============================================================================

export interface ReliableExecutionOptions extends OperationExecutionOptions {
  readonly retryPolicy?: RetryPolicy;

  readonly timeoutMs?: number;

  readonly recover?: boolean;

  readonly recovery?: Omit<
    RecoveryContext,
    "operationId" | "error" | "attempt"
  >;
}

// ============================================================================
// Reliability manager
// ============================================================================

export class ReliabilityManager {
  private readonly failureClassifier = new FailureClassifier();

  private readonly healthManager = new HealthManager();

  private readonly recoveryManager = new RecoveryManager();

  private readonly retryManager = new RetryManager();

  private readonly timeoutManager = new TimeoutManager();

  private readonly operationManager = new OperationManager();

  // ========================================================================
  // Execute
  // ========================================================================

  public async execute<T>(
    options: ReliableExecutionOptions,

    handler: (context: OperationContext) => Promise<T>,
  ): Promise<ReliabilityExecutionResult<T>> {
    // ----------------------------------------------------------------------
    // Create operation
    // ----------------------------------------------------------------------

    const operation = this.operationManager.create(options);

    this.operationManager.transition(
      operation.operationId,
      OPERATION_STATES.STARTING,
    );

    // ----------------------------------------------------------------------
    // Resolve reliability policy
    // ----------------------------------------------------------------------

    const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_POLICY.timeoutMs;

    // ----------------------------------------------------------------------
    // Track final operation snapshot
    // ----------------------------------------------------------------------

    let finalOperation =
      this.operationManager.get(operation.operationId) ?? operation;

    let recovered = false;

    // ----------------------------------------------------------------------
    // Retry + timeout execution
    // ----------------------------------------------------------------------

    const retryResult = await this.retryManager.execute(
      async (attempt) => {
        this.operationManager.transition(
          operation.operationId,

          attempt > 1 ? OPERATION_STATES.RETRYING : OPERATION_STATES.RUNNING,

          attempt,
        );

        finalOperation =
          this.operationManager.get(operation.operationId) ?? finalOperation;

        return this.timeoutManager.execute(
          () => handler(finalOperation),

          {
            timeoutMs,

            message: "Reliability-managed operation timed out.",
          },

          options.signal,
        );
      },

      retryPolicy,

      options.signal,
    );

    // ======================================================================
    // SUCCESS
    // ======================================================================

    if (retryResult.succeeded) {
      this.operationManager.transition(
        operation.operationId,

        OPERATION_STATES.COMPLETED,

        retryResult.attempts,
      );

      finalOperation =
        this.operationManager.get(operation.operationId) ?? finalOperation;

      return Object.freeze({
        operation: finalOperation,

        value: retryResult.value,

        succeeded: true as const,

        recovered: false,

        retried: retryResult.retried,
      });
    }

    // ======================================================================
    // FAILURE
    // ======================================================================

    const error = retryResult.error;

    // ----------------------------------------------------------------------
    // Cancellation
    // ----------------------------------------------------------------------

    if (this.isCancellation(error)) {
      this.operationManager.transition(
        operation.operationId,

        OPERATION_STATES.CANCELLED,

        retryResult.attempts,

        error,
      );

      finalOperation =
        this.operationManager.get(operation.operationId) ?? finalOperation;

      return Object.freeze({
        operation: finalOperation,

        error,

        succeeded: false as const,

        recovered: false,

        retried: retryResult.retried,
      });
    }

    // ----------------------------------------------------------------------
    // Failure classification
    // ----------------------------------------------------------------------

    const classification = this.failureClassifier.classify({
      error,

      operationId: operation.operationId,

      componentId: operation.componentId,

      attempt: retryResult.attempts,
    });

    // ----------------------------------------------------------------------
    // Timeout state
    // ----------------------------------------------------------------------

    if (classification.timedOut) {
      this.operationManager.transition(
        operation.operationId,

        OPERATION_STATES.TIMED_OUT,

        retryResult.attempts,

        error,
      );
    }

    // ======================================================================
    // Recovery
    // ======================================================================

    if (options.recover !== false) {
      this.operationManager.transition(
        operation.operationId,

        OPERATION_STATES.RECOVERING,

        retryResult.attempts,

        error,
      );

      const recovery = await this.recoveryManager.recover({
        operationId: operation.operationId,

        componentId: operation.componentId,

        error,

        attempt: retryResult.attempts,

        policy: options.recovery?.policy,

        actions: options.recovery?.actions,

        signal: options.signal,
      });

      recovered = recovery.recovered;

      // --------------------------------------------------------------------
      // Recovery succeeded
      // --------------------------------------------------------------------

      if (recovered) {
        this.operationManager.transition(
          operation.operationId,

          OPERATION_STATES.COMPLETED,

          retryResult.attempts,
        );

        finalOperation =
          this.operationManager.get(operation.operationId) ?? finalOperation;

        return Object.freeze({
          operation: finalOperation,

          succeeded: true as const,

          recovered: true,

          retried: retryResult.retried,
        });
      }
    }

    // ======================================================================
    // Final failure
    // ======================================================================

    this.operationManager.transition(
      operation.operationId,

      OPERATION_STATES.FAILED,

      retryResult.attempts,

      error,
    );

    finalOperation =
      this.operationManager.get(operation.operationId) ?? finalOperation;

    return Object.freeze({
      operation: finalOperation,

      error,

      succeeded: false as const,

      recovered,

      retried: retryResult.retried,
    });
  }

  // ========================================================================
  // Failure classification
  // ========================================================================

  public classifyFailure(
    error: unknown,

    operationId?: string,

    componentId?: string,

    attempt?: number,
  ): FailureClassification {
    return this.failureClassifier.classify({
      error,

      operationId,

      componentId,

      attempt,
    });
  }

  // ========================================================================
  // Health
  // ========================================================================

  public async checkHealth(request: HealthCheckRequest): Promise<HealthStatus> {
    return this.healthManager.check(request);
  }

  public getHealthManager(): HealthManager {
    return this.healthManager;
  }

  // ========================================================================
  // Recovery
  // ========================================================================

  public getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  // ========================================================================
  // Retry
  // ========================================================================

  public getRetryManager(): RetryManager {
    return this.retryManager;
  }

  // ========================================================================
  // Timeout
  // ========================================================================

  public getTimeoutManager(): TimeoutManager {
    return this.timeoutManager;
  }

  // ========================================================================
  // Operation lifecycle
  // ========================================================================

  public getOperationManager(): OperationManager {
    return this.operationManager;
  }

  // ========================================================================
  // Retry decision
  // ========================================================================

  public decideRetry(
    policy: RetryPolicy,

    attempt: number,

    error: unknown,
  ): RetryDecision {
    return this.retryManager.decide(policy, attempt, error);
  }

  // ========================================================================
  // Direct recovery
  // ========================================================================

  public async recover(context: RecoveryContext): Promise<RecoveryResult> {
    return this.recoveryManager.recover(context);
  }

  // ========================================================================
  // Cancellation
  // ========================================================================

  private isCancellation(error: unknown): boolean {
    if (error instanceof ReliabilityError) {
      return error.code === "reliability.cancellation";
    }

    if (error instanceof DOMException) {
      return error.name === "AbortError";
    }

    return false;
  }
}
