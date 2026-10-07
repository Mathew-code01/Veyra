// ============================================================================
// FILE: core/reliability/errors/FailureCodes.ts
//
// PURPOSE:
// Canonical reliability failure categories.
//
// These describe operational failure semantics rather than business errors.
// ============================================================================

export const RELIABILITY_FAILURE_CODES = Object.freeze({
  UNKNOWN: "reliability.unknown",

  VALIDATION: "reliability.validation",

  CONFIGURATION: "reliability.configuration",

  TIMEOUT: "reliability.timeout",

  CANCELLATION: "reliability.cancellation",

  NETWORK: "reliability.network",

  UNAVAILABLE: "reliability.unavailable",

  RATE_LIMITED: "reliability.rate_limited",

  RESOURCE_EXHAUSTED: "reliability.resource_exhausted",

  DEPENDENCY: "reliability.dependency",

  TRANSIENT: "reliability.transient",

  PERMANENT: "reliability.permanent",

  CIRCUIT_OPEN: "reliability.circuit_open",

  RECOVERY_FAILED: "reliability.recovery_failed",

  INTERNAL: "reliability.internal",
} as const);

export type ReliabilityFailureCode =
  (typeof RELIABILITY_FAILURE_CODES)[keyof typeof RELIABILITY_FAILURE_CODES];
