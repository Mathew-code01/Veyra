// ============================================================================
// FILE: core/reliability/index.ts
//
// PURPOSE:
// Public export surface for the reliability subsystem.
//
// Other Veyra subsystems should prefer importing from this boundary rather
// than reaching deep into reliability implementation files.
// ============================================================================

// ---------------------------------------------------------------------------
// Main facade
// ---------------------------------------------------------------------------

export { ReliabilityManager } from "./ReliabilityManager";

export type { ReliableExecutionOptions } from "./ReliabilityManager";

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export type {
  ReliabilityContract,
  ReliabilityExecutionResult,
} from "./contracts/ReliabilityContract";

export type { HealthContract } from "./contracts/HealthContract";

export type { RecoveryContract } from "./contracts/RecoveryContract";

export type { RetryContract } from "./contracts/RetryContract";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export { ReliabilityError } from "./errors/ReliabilityError";

export { RELIABILITY_FAILURE_CODES } from "./errors/FailureCodes";

export type { ReliabilityFailureCode } from "./errors/FailureCodes";

export { FailureClassifier } from "./errors/FailureClassifier";

export type {
  FailureInput,
  FailureClassification,
} from "./errors/FailureClassifier";

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export { HealthManager } from "./health/HealthManager";

export { HealthRegistry } from "./health/HealthRegistry";

export {
  HEALTH_STATES,
  isHealthyState,
  isAvailableState,
} from "./health/HealthState";

export type { HealthState } from "./health/HealthState";

export type {
  HealthCheck,
  HealthCheckRequest,
  HealthStatus,
} from "./health/HealthCheck";

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export { RecoveryManager } from "./recovery/RecoveryManager";

export type {
  RecoveryContext,
  RecoveryResult,
} from "./recovery/RecoveryManager";

export type {
  RecoveryAction,
  RecoveryActionType,
} from "./recovery/RecoveryAction";

export { DEFAULT_RECOVERY_POLICY } from "./recovery/RecoveryPolicy";

export type { RecoveryPolicy } from "./recovery/RecoveryPolicy";

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

export { RetryManager } from "./retry/RetryManager";

export type { RetryExecutionResult } from "./retry/RetryManager";

export {
  RetryPolicyEvaluator,
  DEFAULT_RETRY_POLICY,
} from "./retry/RetryPolicy";

export type { RetryPolicy, RetryDecision } from "./retry/RetryPolicy";

export { BackoffStrategy } from "./retry/BackoffStrategy";

export type {
  BackoffOptions,
  BackoffStrategyName,
} from "./retry/BackoffStrategy";

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

export { TimeoutManager } from "./timeout/TimeoutManager";

export {
  DEFAULT_TIMEOUT_POLICY,
  resolveTimeout,
} from "./timeout/TimeoutPolicy";

export type { TimeoutPolicy } from "./timeout/TimeoutPolicy";

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export { CircuitBreaker } from "./circuit/CircuitBreaker";

export { CIRCUIT_STATES } from "./circuit/CircuitState";

export type { CircuitState } from "./circuit/CircuitState";

export { DEFAULT_CIRCUIT_BREAKER_POLICY } from "./circuit/CircuitBreakerPolicy";

export type { CircuitBreakerPolicy } from "./circuit/CircuitBreakerPolicy";

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export { OperationManager } from "./execution/OperationManager";

export { OPERATION_STATES } from "./execution/OperationState";

export type { OperationState } from "./execution/OperationState";

export { createOperationId } from "./execution/OperationContext";

export type {
  OperationContext,
  OperationExecutionOptions,
} from "./execution/OperationContext";
