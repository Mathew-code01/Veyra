
// ============================================================================
// FILE: core/ai/AIRoutingCandidate.ts
// PURPOSE:
// Represents one provider candidate evaluated against an AIRoutingPolicy.
//
// RESPONSIBILITIES:
// - Evaluate provider capability requirements
// - Evaluate runtime requirements
// - Evaluate provider allow/deny rules
// - Evaluate supplied health state
// - Produce deterministic routing preference information
//
// NON-RESPONSIBILITIES:
// - Execute the provider
// - Retry execution
// - Perform fallback
// - Perform cloud transport
// - Load local models
// - Inspect hardware
// ============================================================================

import type {
  AIProvider,
  AIProviderHealth,
} from "./AIProvider";

import type {
  AIRoutingPolicy,
} from "./AIRoutingPolicy";

import {
  getProviderPreferencePriority,
  isProviderAllowedByPolicy,
} from "./AIRoutingPolicy";

// ============================================================================
// TYPES
// ============================================================================

export interface AIRoutingCandidateEvaluation {
  readonly provider: AIProvider;

  readonly providerName: string;

  readonly runtime: "local" | "cloud";

  readonly eligible: boolean;

  /**
   * Higher score means higher routing preference.
   *
   * The score is deterministic and transparent. It does not attempt to
   * estimate model intelligence or answer quality.
   */
  readonly score: number;

  /**
   * Stable registration/discovery order.
   */
  readonly registrationOrder: number;

  /**
   * Optional health information supplied by the router.
   */
  readonly health?: AIProviderHealth;

  /**
   * Human-readable reasons explaining the candidate decision.
   */
  readonly reasons: readonly string[];
}

// ============================================================================
// CANDIDATE
// ============================================================================

export class AIRoutingCandidate
  implements AIRoutingCandidateEvaluation
{
  public readonly provider: AIProvider;

  public readonly providerName: string;

  public readonly runtime:
    | "local"
    | "cloud";

  public readonly eligible: boolean;

  public readonly score: number;

  public readonly registrationOrder: number;

  public readonly health?: AIProviderHealth;

  public readonly reasons: readonly string[];

  private constructor(
    evaluation: AIRoutingCandidateEvaluation,
  ) {
    this.provider =
      evaluation.provider;

    this.providerName =
      evaluation.providerName;

    this.runtime =
      evaluation.runtime;

    this.eligible =
      evaluation.eligible;

    this.score =
      evaluation.score;

    this.registrationOrder =
      evaluation.registrationOrder;

    if (
      evaluation.health !== undefined
    ) {
      this.health =
        evaluation.health;
    }

    this.reasons =
      Object.freeze([
        ...evaluation.reasons,
      ]);

    Object.freeze(this);
  }

  // ========================================================================
  // FACTORY
  // ========================================================================

  public static evaluate(
    provider: AIProvider,
    policy: AIRoutingPolicy,
    registrationOrder = 0,
    health?: AIProviderHealth,
  ): AIRoutingCandidate {
    if (!provider.name.trim()) {
      throw new Error(
        "Cannot create an AI routing candidate for a provider without a name.",
      );
    }

    if (
      !Number.isInteger(
        registrationOrder,
      ) ||
      registrationOrder < 0
    ) {
      throw new Error(
        "Routing candidate registrationOrder must be a non-negative integer.",
      );
    }

    const providerName =
      provider.name.trim();

    const runtime =
      provider.capabilities.local
        ? "local"
        : "cloud";

    const reasons: string[] = [];

    let eligible = true;

    // ----------------------------------------------------------------------
    // Provider allow/deny rules
    // ----------------------------------------------------------------------

    if (
      !isProviderAllowedByPolicy(
        providerName,
        policy,
      )
    ) {
      eligible = false;

      reasons.push(
        `Provider "${providerName}" is excluded by routing policy.`,
      );
    } else {
      reasons.push(
        `Provider "${providerName}" is allowed by routing policy.`,
      );
    }

    // ----------------------------------------------------------------------
    // Streaming
    // ----------------------------------------------------------------------

    if (
      policy.requirements.streaming ===
        true &&
      !provider.capabilities.streaming
    ) {
      eligible = false;

      reasons.push(
        "Provider does not support streaming.",
      );
    } else if (
      policy.requirements.streaming ===
      true
    ) {
      reasons.push(
        "Provider supports required streaming.",
      );
    }

    // ----------------------------------------------------------------------
    // Vision
    // ----------------------------------------------------------------------

    if (
      policy.requirements.vision ===
        true &&
      !provider.capabilities.vision
    ) {
      eligible = false;

      reasons.push(
        "Provider does not support required vision capability.",
      );
    } else if (
      policy.requirements.vision ===
      true
    ) {
      reasons.push(
        "Provider supports required vision capability.",
      );
    }

    // ----------------------------------------------------------------------
    // Structured output
    // ----------------------------------------------------------------------

    if (
      policy.requirements
        .structuredOutput ===
        true &&
      !provider.capabilities
        .structuredOutput
    ) {
      eligible = false;

      reasons.push(
        "Provider does not support required structured output.",
      );
    } else if (
      policy.requirements
        .structuredOutput ===
      true
    ) {
      reasons.push(
        "Provider supports required structured output.",
      );
    }

    // ----------------------------------------------------------------------
    // Runtime
    // ----------------------------------------------------------------------

    const requiredRuntime =
      policy.requirements.runtime;

    if (
      requiredRuntime !== undefined &&
      runtime !== requiredRuntime
    ) {
      eligible = false;

      reasons.push(
        [
          `Provider runtime is "${runtime}"`,
          `but policy requires "${requiredRuntime}".`,
        ].join(" "),
      );
    } else if (
      requiredRuntime !== undefined
    ) {
      reasons.push(
        `Provider matches required ${requiredRuntime} runtime.`,
      );
    }

    // ----------------------------------------------------------------------
    // Health
    // ----------------------------------------------------------------------

    if (health !== undefined) {
      switch (health.status) {
        case "unavailable":
          eligible = false;

          reasons.push(
            "Provider health reports unavailable.",
          );
          break;

        case "degraded":
          if (
            !policy.execution
              .allowDegraded
          ) {
            eligible = false;

            reasons.push(
              "Provider is degraded and degraded providers are disabled by policy.",
            );
          } else {
            reasons.push(
              "Provider is degraded but degraded execution is allowed.",
            );
          }
          break;

        case "unknown":
          if (
            !policy.execution
              .allowUnknownHealth
          ) {
            eligible = false;

            reasons.push(
              "Provider health is unknown and unknown-health providers are disabled by policy.",
            );
          } else {
            reasons.push(
              "Provider health is unknown but unknown-health execution is allowed.",
            );
          }
          break;

        case "healthy":
          reasons.push(
            "Provider health is healthy.",
          );
          break;

        default:
          eligible = false;

          reasons.push(
            "Provider returned an unsupported health state.",
          );
          break;
      }
    } else {
      reasons.push(
        "No health snapshot was supplied; provider health is not used for eligibility.",
      );
    }

    // ----------------------------------------------------------------------
    // Deterministic score
    // ----------------------------------------------------------------------

    const preferencePriority =
      getProviderPreferencePriority(
        providerName,
        policy,
      );

    const hasExplicitPreference =
      preferencePriority !==
      Number.MAX_SAFE_INTEGER;

    /**
     * Explicit provider preferences dominate registration order.
     *
     * Example:
     *
     * preferred priority 0:
     *     1,000,000
     *
     * preferred priority 1:
     *       999,000
     *
     * unpreferred:
     *             0
     *
     * Registration order is then used as the deterministic tie-breaker.
     */
    const preferenceScore =
      hasExplicitPreference
        ? 1_000_000 -
          preferencePriority * 1_000
        : 0;

    const healthScore =
      health?.status === "healthy"
        ? 100
        : health?.status === "degraded"
          ? 25
          : 0;

    const registrationScore =
      -registrationOrder;

    const score =
      eligible
        ? preferenceScore +
          healthScore +
          registrationScore
        : Number.NEGATIVE_INFINITY;

    return new AIRoutingCandidate({
      provider,
      providerName,
      runtime,
      eligible,
      score,
      registrationOrder,
      ...(health !== undefined
        ? { health }
        : {}),
      reasons,
    });
  }

  // ========================================================================
  // UTILITIES
  // ========================================================================

  public supportsStreaming(): boolean {
    return (
      this.provider.capabilities
        .streaming
    );
  }

  public supportsVision(): boolean {
    return (
      this.provider.capabilities
        .vision
    );
  }

  public supportsStructuredOutput(): boolean {
    return (
      this.provider.capabilities
        .structuredOutput
    );
  }

  public isLocal(): boolean {
    return (
      this.provider.capabilities.local
    );
  }

  public isCloud(): boolean {
    return !this.isLocal();
  }
}
