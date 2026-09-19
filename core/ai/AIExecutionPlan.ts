// ============================================================================
// FILE: core/ai/AIExecutionPlan.ts
// PURPOSE:
// Represents an immutable execution plan produced by AIRouter.
//
// RESPONSIBILITIES:
// - Bind an AIRequest to a routing policy
// - Hold evaluated routing candidates
// - Order eligible candidates deterministically
// - Expose primary and fallback candidates
//
// NON-RESPONSIBILITIES:
// - Provider execution
// - Retry
// - Fallback execution
// - Cloud transport
// - Local model loading
// - Hardware inspection
// ============================================================================

import type { AIRequest } from "./AIRequest";

import { AIError } from "./AIError";

import type { AIRoutingCandidate } from "./AIRoutingCandidate";

import type { AIRoutingPolicy } from "./AIRoutingPolicy";

// ============================================================================
// TYPES
// ============================================================================

export interface AIExecutionPlanMetadata {
  readonly planId: string;

  readonly requestId: string;

  readonly createdAt: number;

  readonly candidateCount: number;

  readonly eligibleCandidateCount: number;
}

export interface AIExecutionPlanOptions {
  readonly planId?: string;

  readonly createdAt?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function createPlanId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `ai-plan-${crypto.randomUUID()}`;
  }

  /**
   * Fallback for environments where Web Crypto is not globally exposed.
   *
   * This is only an identifier and is not used as a security token.
   */
  return [
    "ai-plan",
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join("-");
}

function normalizeCreatedAt(value: number | undefined): number {
  if (value === undefined) {
    return Date.now();
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new AIError(
      "AI execution plan createdAt must be a finite non-negative number.",
      "INVALID_REQUEST",
      {
        retryable: false,
        details: {
          details: {
            createdAt: value,
          },
        },
      },
    );
  }

  return value;
}

function normalizePlanId(value: string | undefined): string {
  if (value === undefined) {
    return createPlanId();
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new AIError(
      "AI execution plan planId cannot be empty.",
      "INVALID_REQUEST",
      {
        retryable: false,
      },
    );
  }

  return normalized;
}

// ============================================================================
// PLAN
// ============================================================================

export class AIExecutionPlan {
  public readonly planId: string;

  public readonly request: AIRequest;

  public readonly policy: AIRoutingPolicy;

  public readonly candidates: readonly AIRoutingCandidate[];

  public readonly createdAt: number;

  public readonly metadata: AIExecutionPlanMetadata;

  private constructor(
    request: AIRequest,
    policy: AIRoutingPolicy,
    candidates: readonly AIRoutingCandidate[],
    options: AIExecutionPlanOptions,
  ) {
    this.request = request;

    this.policy = policy;

    this.candidates = Object.freeze([...candidates]);

    this.planId = normalizePlanId(options.planId);

    this.createdAt = normalizeCreatedAt(options.createdAt);

    this.metadata = Object.freeze({
      planId: this.planId,

      requestId: request.requestId,

      createdAt: this.createdAt,

      candidateCount: this.candidates.length,

      eligibleCandidateCount: this.candidates.filter(
        (candidate) => candidate.eligible,
      ).length,
    });

    Object.freeze(this);
  }

  // ==========================================================================
  // FACTORY
  // ==========================================================================

  public static create(
    request: AIRequest,
    policy: AIRoutingPolicy,
    candidates: readonly AIRoutingCandidate[],
    options: AIExecutionPlanOptions = {},
  ): AIExecutionPlan {
    if (!request) {
      throw new AIError(
        "Cannot create an AI execution plan without an AI request.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    if (typeof request.requestId !== "string" || !request.requestId.trim()) {
      throw new AIError(
        "Cannot create an AI execution plan without a requestId.",
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            details: {
              requestId: request.requestId,
            },
          },
        },
      );
    }

    if (!policy) {
      throw new AIError(
        "Cannot create an AI execution plan without a routing policy.",
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            details: {
              requestId: request.requestId,
            },
          },
        },
      );
    }

    if (!Array.isArray(candidates)) {
      throw new AIError(
        "AI execution plan candidates must be an array.",
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            details: {
              requestId: request.requestId,
            },
          },
        },
      );
    }

    if (candidates.length === 0) {
      throw new AIError(
        "Cannot create an AI execution plan because no routing candidates were provided.",
        "UNAVAILABLE",
        {
          retryable: false,
          details: {
            details: {
              requestId: request.requestId,
              candidateCount: 0,
              eligibleCandidateCount: 0,
            },
          },
        },
      );
    }

    const eligibleCandidates = candidates.filter(
      (candidate) => candidate.eligible,
    );

    if (eligibleCandidates.length === 0) {
      const candidateDetails: readonly Readonly<Record<string, unknown>>[] =
        Object.freeze(
          candidates.map((candidate) =>
            Object.freeze({
              provider: candidate.providerName,

              runtime: candidate.runtime,

              eligible: candidate.eligible,

              score: candidate.score,

              reasons: Object.freeze([...candidate.reasons]),
            }),
          ),
        );

      throw new AIError(
        "No AI provider satisfies the routing policy.",
        "UNAVAILABLE",
        {
          retryable: false,
          details: {
            details: {
              requestId: request.requestId,

              candidateCount: candidates.length,

              eligibleCandidateCount: 0,

              candidates: candidateDetails,
            },
          },
        },
      );
    }

    /**
     * Highest score first.
     *
     * Registration order and provider name are deterministic tie-breakers.
     */
    const ordered = [...eligibleCandidates].sort(
      (a, b) =>
        b.score - a.score ||
        a.registrationOrder - b.registrationOrder ||
        a.providerName.localeCompare(b.providerName),
    );

    const maxCandidates = policy.execution.maxCandidates;

    const limited = Number.isFinite(maxCandidates)
      ? ordered.slice(0, maxCandidates)
      : ordered;

    if (limited.length === 0) {
      throw new AIError(
        "Routing policy produced an empty execution plan.",
        "UNAVAILABLE",
        {
          retryable: false,
          details: {
            details: {
              requestId: request.requestId,

              candidateCount: candidates.length,

              eligibleCandidateCount: eligibleCandidates.length,

              maxCandidates,
            },
          },
        },
      );
    }

    return new AIExecutionPlan(request, policy, limited, options);
  }

  // ==========================================================================
  // ACCESSORS
  // ==========================================================================

  public getPrimaryCandidate(): AIRoutingCandidate {
    const candidate = this.candidates[0];

    if (!candidate) {
      throw new AIError(
        "AI execution plan does not contain a primary candidate.",
        "UNAVAILABLE",
        {
          retryable: false,
          details: {
            details: {
              planId: this.planId,

              requestId: this.request.requestId,
            },
          },
        },
      );
    }

    return candidate;
  }

  public getFallbackCandidates(): readonly AIRoutingCandidate[] {
    return Object.freeze([...this.candidates.slice(1)]);
  }

  public getCandidate(providerName: string): AIRoutingCandidate | undefined {
    const normalized = providerName.trim();

    if (!normalized) {
      return undefined;
    }

    return this.candidates.find(
      (candidate) => candidate.providerName === normalized,
    );
  }

  public hasFallback(): boolean {
    return this.candidates.length > 1;
  }

  public getCandidateCount(): number {
    return this.candidates.length;
  }

  public getFallbackCount(): number {
    return Math.max(0, this.candidates.length - 1);
  }
}
