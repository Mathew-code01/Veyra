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

export interface ReliabilityExecutionResult<T> {
  readonly operation: OperationContext;
  readonly value?: T;
  readonly error?: unknown;
  readonly succeeded: boolean;
  readonly recovered: boolean;
  readonly retried: boolean;
}

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
