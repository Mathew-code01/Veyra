
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
// IMPORTANT RESULT SEMANTICS:
//
// A successful recovery action does NOT automatically mean the original
// operation succeeded.
//
// Example:
//
//   operation fails
//        ↓
//   recovery refreshes health
//        ↓
//   recovery succeeds
//
// The reliability result is:
//
//   succeeded: false
//   recovered: true
//
// The caller can then decide whether the original operation should be
// explicitly executed again according to its domain policy.
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

import { RetryManager } from "./retry/RetryManager";

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

import type {
  ReliabilityExecutionResult,
  ReliabilityExecutionSuccess,
} from "./contracts/ReliabilityContract";

// ============================================================================
// RELIABLE EXECUTION OPTIONS
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
// RELIABILITY MANAGER
// ============================================================================

export class ReliabilityManager {
  private readonly failureClassifier = new FailureClassifier();

  private readonly healthManager = new HealthManager();

  private readonly recoveryManager = new RecoveryManager();

  private readonly retryManager = new RetryManager();

  private readonly timeoutManager = new TimeoutManager();

  private readonly operationManager = new OperationManager();

  // ========================================================================
  // EXECUTE
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

      const result: ReliabilityExecutionSuccess<T> = Object.freeze({
        operation: finalOperation,

        value: retryResult.value,

        succeeded: true,

        recovered: false,

        retried: retryResult.retried,
      });

      return result;
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
    // RECOVERY
    // ======================================================================

    let recovered = false;

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
      // Recovery action succeeded.
      //
      // IMPORTANT:
      // Recovery does not produce the original operation's T value.
      // Therefore the execution remains unsuccessful.
      //
      // The result tells the caller:
      //
      //   succeeded: false
      //   recovered: true
      //
      // The caller may decide to execute the operation again.
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

          error,

          succeeded: false as const,

          recovered: true,

          retried: retryResult.retried,
        });
      }
    }

    // ======================================================================
    // FINAL FAILURE
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
  // FAILURE CLASSIFICATION
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
  // HEALTH
  // ========================================================================

  public async checkHealth(request: HealthCheckRequest): Promise<HealthStatus> {
    return this.healthManager.check(request);
  }

  public getHealthManager(): HealthManager {
    return this.healthManager;
  }

  // ========================================================================
  // RECOVERY
  // ========================================================================

  public getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  // ========================================================================
  // RETRY
  // ========================================================================

  public getRetryManager(): RetryManager {
    return this.retryManager;
  }

  // ========================================================================
  // TIMEOUT
  // ========================================================================

  public getTimeoutManager(): TimeoutManager {
    return this.timeoutManager;
  }

  // ========================================================================
  // OPERATION LIFECYCLE
  // ========================================================================

  public getOperationManager(): OperationManager {
    return this.operationManager;
  }

  // ========================================================================
  // RETRY DECISION
  // ========================================================================

  public decideRetry(
    policy: RetryPolicy,

    attempt: number,

    error: unknown,
  ): RetryDecision {
    return this.retryManager.decide(policy, attempt, error);
  }

  // ========================================================================
  // DIRECT RECOVERY
  // ========================================================================

  public async recover(context: RecoveryContext): Promise<RecoveryResult> {
    return this.recoveryManager.recover(context);
  }

  // ========================================================================
  // CANCELLATION
  // ========================================================================

  private isCancellation(error: unknown): boolean {
    if (error instanceof ReliabilityError) {
      return error.code === "reliability.cancellation";
    }

    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException
    ) {
      return error.name === "AbortError";
    }

    return error instanceof Error && error.name === "AbortError";
  }
}
