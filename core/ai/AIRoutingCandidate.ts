
// ============================================================================
// FILE: core/ai/AIRoutingCandidate.ts
// PURPOSE:
// Represents an AI provider that has been evaluated as a possible execution
// target.
//
// ARCHITECTURE:
//
// AIProvider
//     │
//     ▼
// AIRoutingCandidate
//     │
//     ├── capability result
//     ├── health result
//     ├── policy result
//     ├── preference
//     └── routing score
//     │
//     ▼
// AIExecutionPlan
//
// IMPORTANT:
//
// This class does not execute the provider.
// It only describes why the provider is or is not suitable.
// ============================================================================

import type {
  AIProvider,
  AIProviderHealth,
} from "./AIProvider";

import type {
  AIRoutingPolicy,
} from "./AIRoutingPolicy";

// ============================================================================
// TYPES
// ============================================================================

export type AIRoutingCandidateStatus =
  | "eligible"
  | "ineligible"
  | "unavailable";

export type AIRoutingRejectionReason =
  | "provider_excluded"
  | "provider_not_allowed"
  | "runtime_mismatch"
  | "streaming_unsupported"
  | "vision_unsupported"
  | "structured_output_unsupported"
  | "unhealthy"
  | "unknown_health"
  | "invalid_provider";

export interface AIRoutingCandidate {
  readonly provider: AIProvider;

  readonly providerName: string;

  readonly runtime: "local" | "cloud";

  readonly status: AIRoutingCandidateStatus;

  readonly eligible: boolean;

  readonly preferencePriority: number;

  /**
   * Lower score means earlier execution.
   *
   * Score is deterministic and is derived from policy preference plus
   * capability/health suitability.
   */
  readonly score: number;

  readonly health?: AIProviderHealth;

  readonly rejectionReasons: readonly AIRoutingRejectionReason[];

  readonly details: Readonly<Record<string, unknown>>;
}

// ============================================================================
// HELPERS
// ============================================================================

function runtimeOf(
  provider: AIProvider,
): "local" | "cloud" {
  return provider.capabilities.local ? "local" : "cloud";
}

function providerHealthAccepted(
  health: AIProviderHealth | undefined,
  policy: AIRoutingPolicy,
): {
  readonly accepted: boolean;
  readonly reason?: AIRoutingRejectionReason;
} {
  if (!health) {
    return policy.execution.allowUnknownHealth
      ? { accepted: true }
      : { accepted: false, reason: "unknown_health" };
  }

  switch (health.status) {
    case "healthy":
      return { accepted: true };

    case "degraded":
      return policy.execution.allowDegraded
        ? { accepted: true }
        : {
            accepted: false,
            reason: "unhealthy",
          };

    case "unknown":
      return policy.execution.allowUnknownHealth
        ? { accepted: true }
        : {
            accepted: false,
            reason: "unknown_health",
          };

    case "unavailable":
    default:
      return {
        accepted: false,
        reason: "unhealthy",
      };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Evaluate a provider against a routing policy.
 *
 * This function is synchronous because it evaluates the provider contract
 * and an already available health result. Health probing itself belongs to
 * AIRouter or the health-monitoring layer.
 */
export function createAIRoutingCandidate(
  provider: AIProvider,
  policy: AIRoutingPolicy,
  health?: AIProviderHealth,
): AIRoutingCandidate {
  const rejectionReasons: AIRoutingRejectionReason[] = [];

  const providerName = provider.name.trim();

  if (!providerName) {
    rejectionReasons.push("invalid_provider");
  }

  const runtime = runtimeOf(provider);

  const requirements = policy.requirements;

  const allowedProviders =
    requirements.allowedProviders;

  const excludedProviders =
    requirements.excludedProviders;

  if (
    allowedProviders &&
    allowedProviders.length > 0 &&
    !allowedProviders.includes(providerName)
  ) {
    rejectionReasons.push("provider_not_allowed");
  }

  if (excludedProviders?.includes(providerName)) {
    rejectionReasons.push("provider_excluded");
  }

  if (
    requirements.runtime !== undefined &&
    requirements.runtime !== runtime
  ) {
    rejectionReasons.push("runtime_mismatch");
  }

  if (
    requirements.streaming === true &&
    !provider.capabilities.streaming
  ) {
    rejectionReasons.push("streaming_unsupported");
  }

  if (
    requirements.vision === true &&
    !provider.capabilities.vision
  ) {
    rejectionReasons.push("vision_unsupported");
  }

  if (
    requirements.structuredOutput === true &&
    !provider.capabilities.structuredOutput
  ) {
    rejectionReasons.push("structured_output_unsupported");
  }

  const healthResult = providerHealthAccepted(
    health,
    policy,
  );

  if (!healthResult.accepted && healthResult.reason) {
    rejectionReasons.push(healthResult.reason);
  }

  const uniqueReasons = Object.freeze([
    ...new Set(rejectionReasons),
  ]);

  const eligible = uniqueReasons.length === 0;

  const preferencePriority = policy.preferredProviders.find(
    (preference) =>
      preference.provider === providerName,
  )?.priority ?? Number.MAX_SAFE_INTEGER;

  /**
   * The score is intentionally simple and deterministic.
   *
   * Explicit provider preferences dominate.
   *
   * A provider with no explicit preference is still eligible, but it is
   * considered after explicitly preferred providers.
   */
  const preferenceScore =
    preferencePriority === Number.MAX_SAFE_INTEGER
      ? 1_000_000
      : preferencePriority * 1_000;

  /**
   * Local providers receive a small deterministic tie-breaker only when no
   * explicit preference exists. This does not override an explicit policy.
   */
  const localTieBreaker =
    preferencePriority === Number.MAX_SAFE_INTEGER &&
    runtime === "local"
      ? 0
      : 1;

  const score =
    preferenceScore +
    localTieBreaker;

  return Object.freeze({
    provider,

    providerName,

    runtime,

    status: eligible
      ? "eligible"
      : health?.status === "unavailable"
        ? "unavailable"
        : "ineligible",

    eligible,

    preferencePriority,

    score,

    ...(health !== undefined
      ? {
          health,
        }
      : {}),

    rejectionReasons: uniqueReasons,

    details: Object.freeze({
      streaming: provider.capabilities.streaming,

      vision: provider.capabilities.vision,

      structuredOutput:
        provider.capabilities.structuredOutput,

      local: provider.capabilities.local,
    }),
  });
}

// ============================================================================
// SORTING
// ============================================================================

/**
 * Sort routing candidates without mutating the caller's array.
 *
 * Ordering:
 *
 * 1. Eligible candidates
 * 2. Lower routing score
 * 3. Healthy candidates
 * 4. Provider name for deterministic ordering
 */
export function sortAIRoutingCandidates(
  candidates: readonly AIRoutingCandidate[],
): readonly AIRoutingCandidate[] {
  const healthRank = (
    health: AIProviderHealth | undefined,
  ): number => {
    switch (health?.status) {
      case "healthy":
        return 0;

      case "degraded":
        return 1;

      case "unknown":
        return 2;

      case "unavailable":
        return 3;

      default:
        return 2;
    }
  };

  return Object.freeze(
    [...candidates].sort((a, b) => {
      if (a.eligible !== b.eligible) {
        return a.eligible ? -1 : 1;
      }

      if (a.score !== b.score) {
        return a.score - b.score;
      }

      const healthDifference =
        healthRank(a.health) -
        healthRank(b.health);

      if (healthDifference !== 0) {
        return healthDifference;
      }

      return a.providerName.localeCompare(
        b.providerName,
      );
    }),
  );
}

/**
 * Return only executable candidates.
 */
export function getEligibleAIRoutingCandidates(
  candidates: readonly AIRoutingCandidate[],
): readonly AIRoutingCandidate[] {
  return Object.freeze(
    candidates.filter(
      (candidate) => candidate.eligible,
    ),
  );
}
