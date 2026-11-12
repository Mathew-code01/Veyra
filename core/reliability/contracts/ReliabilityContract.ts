// ============================================================================
// FILE: core/reliability/contracts/ReliabilityContract.ts
//
// PURPOSE:
// Public contract for the Veyra reliability subsystem.
//
// CORE QUESTION:
// "How do we keep operations reliable when things fail?"
//
// RESPONSIBILITIES:
// - Define the common reliability boundary.
// - Provide operation execution with reliability controls.
// - Expose health information.
// - Expose failure classification.
// - Expose retry/recovery decisions.
//
// IMPORTANT:
// This contract is intentionally domain-neutral.
//
// Reliability must NOT know about:
// - AI
// - interviews
// - audio
// - documents
// - vision
// - prompts
// - UI
// - providers
//
// Those systems consume reliability; reliability does not consume them.
//
// RESULT SEMANTICS:
//
// succeeded === true
//   - The operation actually completed successfully.
//   - value is guaranteed to exist as a property.
//   - value may legitimately be undefined when T is void.
//
// succeeded === false
//   - The operation did not successfully produce its requested result.
//   - error is guaranteed to exist as a property.
//   - recovered may still be true when a recovery action succeeded.
//
// IMPORTANT:
// "recovered" and "succeeded" are deliberately separate.
//
// A recovery action such as refreshing health, reinitializing a resource,
// or resetting infrastructure does not automatically mean the original
// operation succeeded.
//
// The caller may decide to execute the original operation again after
// recovery if its domain policy requires that behaviour.
// ============================================================================

import type {
  FailureClassification,
  FailureInput,
} from "../errors/FailureClassifier";

import type { HealthCheckRequest, HealthStatus } from "../health/HealthCheck";

import type { RetryDecision, RetryPolicy } from "../retry/RetryPolicy";

import type {
  RecoveryContext,
  RecoveryResult,
} from "../recovery/RecoveryManager";

import type {
  OperationContext,
  OperationExecutionOptions,
} from "../execution/OperationContext";

// ============================================================================
// SUCCESS RESULT
// ============================================================================

export interface ReliabilityExecutionSuccess<T> {
  /**
   * Final operation snapshot.
   */
  readonly operation: OperationContext;

  /**
   * Value produced by the successful operation.
   *
   * T may be void. In that case the property still exists and its value
   * may be undefined.
   */
  readonly value: T;

  /**
   * Discriminant for type-safe result narrowing.
   */
  readonly succeeded: true;

  /**
   * Whether the operation succeeded after one or more retry attempts.
   *
   * This is false when the operation succeeds on its first attempt.
   */
  readonly recovered: false;

  /**
   * Whether more than one execution attempt was required.
   */
  readonly retried: boolean;
}

// ============================================================================
// FAILURE RESULT
// ============================================================================

export interface ReliabilityExecutionFailure {
  /**
   * Final operation snapshot.
   */
  readonly operation: OperationContext;

  /**
   * Final operation error.
   */
  readonly error: unknown;

  /**
   * Discriminant for type-safe result narrowing.
   */
  readonly succeeded: false;

  /**
   * Whether a recovery action itself completed successfully.
   *
   * This does NOT mean that the original operation produced a value.
   */
  readonly recovered: boolean;

  /**
   * Whether more than one execution attempt was required.
   */
  readonly retried: boolean;
}

// ============================================================================
// EXECUTION RESULT
// ============================================================================

export type ReliabilityExecutionResult<T> =
  ReliabilityExecutionSuccess<T> | ReliabilityExecutionFailure;

// ============================================================================
// PUBLIC RELIABILITY CONTRACT
// ============================================================================

export interface ReliabilityContract {
  execute<T>(
    operation: OperationExecutionOptions,
    handler: (context: OperationContext) => Promise<T>,
  ): Promise<ReliabilityExecutionResult<T>>;

  classifyFailure(input: FailureInput): FailureClassification;

  checkHealth(request: HealthCheckRequest): Promise<HealthStatus>;

  decideRetry(
    policy: RetryPolicy,
    attempt: number,
    error: unknown,
  ): RetryDecision;

  recover(context: RecoveryContext): Promise<RecoveryResult>;
}
