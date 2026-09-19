
// ============================================================================
// FILE: core/ai/AIExecutionPlan.ts
// PURPOSE:
// Immutable execution plan produced by AIRouter and consumed by
// AIExecutionStrategy.
//
// ARCHITECTURE:
//
// AIRequest
//     │
//     ▼
// AIRouter
//     │
//     ▼
// AIExecutionPlan
//     │
//     ├── selected candidates
//     ├── routing policy
//     └── execution limits
//     │
//     ▼
// AIExecutionStrategy
//
// IMPORTANT:
//
// AIExecutionPlan contains decisions.
// It does not execute anything.
//
// This separation allows Veyra to:
// - inspect routing decisions
// - log routing decisions
// - test routing independently
// - execute generation and streaming consistently
// - add reliability behavior without changing AIRouter
// ============================================================================

import type { AIRequest } from "./AIRequest";

import type {
  AIRoutingCandidate,
} from "./AIRoutingCandidate";

import type {
  AIRoutingPolicy,
} from "./AIRoutingPolicy";

import { AIError } from "./AIError";

// ============================================================================
// TYPES
// ============================================================================

export interface AIExecutionPlan {
  /**
   * Original request being executed.
   */
  readonly request: AIRequest;

  /**
   * Ordered executable candidates.
   *
   * Candidate index 0 is the primary execution target.
   */
  readonly candidates: readonly AIRoutingCandidate[];

  /**
   * Routing policy used to construct this plan.
   */
  readonly policy: AIRoutingPolicy;

  /**
   * Primary provider.
   *
   * Undefined when no candidate is available.
   */
  readonly primary?: AIRoutingCandidate;

  /**
   * Timestamp when the plan was created.
   */
  readonly createdAt: number;

  /**
   * Immutable execution metadata.
   */
  readonly details: Readonly<Record<string, unknown>>;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an immutable execution plan.
 *
 * Candidates must already have been evaluated by AIRouter.
 */
export function createAIExecutionPlan(
  request: AIRequest,
  candidates: readonly AIRoutingCandidate[],
  policy: AIRoutingPolicy,
): AIExecutionPlan {
  if (!request) {
    throw new AIError(
      "Cannot create an AI execution plan without a request.",
      "INVALID_REQUEST",
    );
  }

  if (!policy) {
    throw new AIError(
      "Cannot create an AI execution plan without a routing policy.",
      "INVALID_REQUEST",
    );
  }

  const executableCandidates = candidates.filter(
    (candidate) => candidate.eligible,
  );

  const maxCandidates =
    policy.execution.maxCandidates;

  const limitedCandidates =
    executableCandidates.slice(
      0,
      maxCandidates,
    );

  if (limitedCandidates.length === 0) {
    throw new AIError(
      "No eligible AI provider is available for the requested execution plan.",
      "UNAVAILABLE",
      {
        retryable: false,

        details: {
          runtime:
            policy.requirements.runtime,

          candidateCount:
            candidates.length,

          eligibleCandidateCount:
            executableCandidates.length,

          rejectionReasons:
            candidates.flatMap(
              (candidate) =>
                candidate.rejectionReasons,
            ),
        },
      },
    );
  }

  const frozenCandidates = Object.freeze([
    ...limitedCandidates,
  ]);

  const primary = frozenCandidates[0];

  return Object.freeze({
    request,

    candidates: frozenCandidates,

    policy,

    primary,

    createdAt: Date.now(),

    details: Object.freeze({
      candidateCount:
        frozenCandidates.length,

      primaryProvider:
        primary.providerName,

      primaryRuntime:
        primary.runtime,
    }),
  });
}

// ============================================================================
// PLAN UTILITIES
// ============================================================================

/**
 * Return the next candidate after a failed provider.
 */
export function getNextExecutionCandidate(
  plan: AIExecutionPlan,
  currentIndex: number,
): AIRoutingCandidate | undefined {
  const nextIndex = currentIndex + 1;

  return plan.candidates[nextIndex];
}

/**
 * Check whether another provider can be attempted.
 */
export function hasFallbackCandidate(
  plan: AIExecutionPlan,
  currentIndex: number,
): boolean {
  return (
    currentIndex + 1 <
    plan.candidates.length
  );
}

/**
 * Return a provider execution order.
 */
export function getExecutionOrder(
  plan: AIExecutionPlan,
): readonly AIRoutingCandidate[] {
  return plan.candidates;
}
