
// ============================================================================
// FILE: core/ai/AIRouter.ts
// PURPOSE:
// Selects and plans AI providers for an AI request.
//
// RESPONSIBILITIES:
// - Inspect registered AI providers
// - Convert legacy AIRoute configuration into AIRoutingPolicy
// - Evaluate providers into AIRoutingCandidates
// - Create immutable AIExecutionPlans
// - Delegate execution to AIExecutionStrategy
//
// NON-RESPONSIBILITIES:
// - Provider implementation
// - Cloud transport
// - Local model loading
// - Hardware inspection
// - Prompt construction
// - Provider retry logic
// - Provider fallback execution
//
// ARCHITECTURE:
//
// AIRequest
//     │
//     ▼
// AIRouter
//     │
//     ├── AIRoutingPolicy
//     │
//     ├── AIRoutingCandidate[]
//     │
//     └── AIExecutionPlan
//             │
//             ▼
//       AIExecutionStrategy
//             │
//             ├── provider A
//             ├── provider B
//             └── provider N
// ============================================================================

import type {
  AIManager,
} from "./AIManager";

import type {
  AIRequest,
} from "./AIRequest";

import type {
  AIProvider,
} from "./AIProvider";

import type {
  AIResponse,
  AIStreamChunk,
} from "./AIResponse";

import {
  AIError,
} from "./AIError";

import {
  AIExecutionPlan,
} from "./AIExecutionPlan";

import {
  AIExecutionStrategy,
} from "./AIExecutionStrategy";

import {
  AIRoutingCandidate,
} from "./AIRoutingCandidate";

import {
  createAIRoutingPolicy,
  createAIRoutingPolicyFromRequest,
  type AIRoutingPolicy,
  type AIRoutingPolicyOptions,
} from "./AIRoutingPolicy";

// ============================================================================
// LEGACY ROUTE CONTRACT
// ============================================================================

/**
 * Backwards-compatible route definition.
 *
 * New code should prefer AIRoutingPolicyOptions.
 */
export interface AIRoute {
  /**
   * Providers eligible for this request.
   */
  readonly providers?: readonly string[];

  /**
   * Provider that should be attempted first.
   */
  readonly preferredProvider?: string;

  /**
   * Require streaming capability.
   */
  readonly requireStreaming?: boolean;

  /**
   * Require vision capability.
   */
  readonly requireVision?: boolean;

  /**
   * Require local execution.
   */
  readonly requireLocal?: boolean;

  /**
   * Require structured output.
   */
  readonly requireStructuredOutput?: boolean;

  /**
   * Allow fallback to another eligible provider.
   *
   * Defaults to true.
   */
  readonly allowFallback?: boolean;

  /**
   * Maximum attempts for one provider.
   */
  readonly maxAttemptsPerProvider?: number;
}

// ============================================================================
// ROUTER
// ============================================================================

export class AIRouter {
  private readonly manager: AIManager;

  private readonly executionStrategy:
    AIExecutionStrategy;

  public constructor(
    manager: AIManager,
    executionStrategy?: AIExecutionStrategy,
  ) {
    this.manager = manager;

    this.executionStrategy =
      executionStrategy ??
      new AIExecutionStrategy();
  }

  // ========================================================================
  // PROVIDER DISCOVERY
  // ========================================================================

  private getProviders():
    readonly AIProvider[] {
    return this.manager.list();
  }

  // ========================================================================
  // POLICY CREATION
  // ========================================================================

  /**
   * Convert the legacy AIRoute contract into the new routing policy.
   */
  private policyFromLegacyRoute(
    route: AIRoute,
  ): AIRoutingPolicy {
    const allowedProviders =
      route.providers !== undefined
        ? [...route.providers]
        : undefined;

    const preferredProviders =
      route.preferredProvider !== undefined
        ? [route.preferredProvider]
        : undefined;

    const runtime =
      route.requireLocal === true
        ? "local"
        : undefined;

    return createAIRoutingPolicy({
      preferredProviders,

      requirements: {
        ...(route.requireStreaming !== undefined
          ? {
              streaming:
                route.requireStreaming,
            }
          : {}),

        ...(route.requireVision !== undefined
          ? {
              vision:
                route.requireVision,
            }
          : {}),

        ...(route.requireStructuredOutput !== undefined
          ? {
              structuredOutput:
                route.requireStructuredOutput,
            }
          : {}),

        ...(runtime !== undefined
          ? {
              runtime,
            }
          : {}),

        ...(allowedProviders !== undefined
          ? {
              allowedProviders,
            }
          : {}),
      },

      execution: {
        ...(route.allowFallback !== undefined
          ? {
              allowFallback:
                route.allowFallback,
            }
          : {}),

        ...(route.maxAttemptsPerProvider !== undefined
          ? {
              maxAttemptsPerCandidate:
                route.maxAttemptsPerProvider,
            }
          : {}),
      },
    });
  }

  // ========================================================================
  // CANDIDATE EVALUATION
  // ========================================================================

  /**
   * Evaluate all registered providers against a policy.
   *
   * Health is deliberately not probed here. Health probing can be expensive
   * and should be supplied by a higher-level health monitor/cache when
   * available.
   */
  public evaluate(
    policy: AIRoutingPolicy,
  ): readonly AIRoutingCandidate[] {
    const providers =
      this.getProviders();

    return Object.freeze(
      providers.map(
        (
          provider,
          index,
        ) =>
          AIRoutingCandidate.evaluate(
            provider,
            policy,
            index,
          ),
      ),
    );
  }

  // ========================================================================
  // PLAN CREATION
  // ========================================================================

  /**
   * Create an execution plan using an already-normalized policy.
   */
  public createPlan(
    request: AIRequest,
    policy: AIRoutingPolicy,
  ): AIExecutionPlan {
    const candidates =
      this.evaluate(policy);

    return AIExecutionPlan.create(
      request,
      policy,
      candidates,
    );
  }

  /**
   * Create an execution plan from policy options.
   *
   * Request-derived vision and structured-output requirements are merged with
   * caller-supplied requirements.
   */
  public createPlanFromOptions(
    request: AIRequest,
    options: AIRoutingPolicyOptions = {},
  ): AIExecutionPlan {
    const requestPolicy =
      createAIRoutingPolicyFromRequest(
        request,
        options,
      );

    return this.createPlan(
      request,
      requestPolicy,
    );
  }

  // ========================================================================
  // LEGACY SELECTION
  // ========================================================================

  /**
   * Select the primary provider from a legacy AIRoute.
   *
   * This method remains for backwards compatibility.
   *
   * New execution code should prefer createPlan() followed by the execution
   * strategy.
   */
  public select(
    route: AIRoute,
  ): AIProvider {
    const policy =
      this.policyFromLegacyRoute(
        route,
      );

    const candidates =
      this.evaluate(policy);

    const eligible =
      candidates.find(
        (candidate) =>
          candidate.eligible,
      );

    if (!eligible) {
      /**
       * IMPORTANT:
       *
       * AIErrorDetails has a stable top-level schema.
       *
       * Arbitrary diagnostic information such as:
       * - route
       * - candidateCount
       * - candidates
       *
       * MUST live inside `details`.
       *
       * We intentionally create a plain diagnostic object here instead of
       * passing the AIRoute object directly. This prevents accidental
       * mutation/reference sharing and makes the error payload safe to
       * serialize.
       */
      const routeDetails:
        Readonly<Record<string, unknown>> =
        Object.freeze({
          providers:
            route.providers !== undefined
              ? Object.freeze([
                  ...route.providers,
                ])
              : undefined,

          preferredProvider:
            route.preferredProvider,

          requireStreaming:
            route.requireStreaming,

          requireVision:
            route.requireVision,

          requireLocal:
            route.requireLocal,

          requireStructuredOutput:
            route.requireStructuredOutput,

          allowFallback:
            route.allowFallback,

          maxAttemptsPerProvider:
            route.maxAttemptsPerProvider,
        });

      const candidateDetails:
        readonly Readonly<Record<string, unknown>>[] =
        Object.freeze(
          candidates.map(
            (candidate) =>
              Object.freeze({
                provider:
                  candidate.providerName,

                runtime:
                  candidate.runtime,

                eligible:
                  candidate.eligible,

                score:
                  candidate.score,

                reasons:
                  Object.freeze([
                    ...candidate.reasons,
                  ]),
              }),
          ),
        );

      const errorDetails:
        Readonly<Record<string, unknown>> =
        Object.freeze({
          route:
            routeDetails,

          candidateCount:
            candidates.length,

          candidates:
            candidateDetails,
        });

      throw new AIError(
        "No AI provider satisfies the requested route.",
        "UNAVAILABLE",
        {
          retryable: false,

          details:
            errorDetails,
        },
      );
    }

    return eligible.provider;
  }

  // ========================================================================
  // LEGACY GENERATE
  // ========================================================================

  /**
   * Generate using a legacy AIRoute.
   *
   * The route is now converted into a plan and executed through the same
   * production execution strategy used by the new architecture.
   */
  public async generate(
    request: AIRequest,
    route: AIRoute,
  ): Promise<AIResponse> {
    const policy =
      this.policyFromLegacyRoute(
        route,
      );

    const plan =
      this.createPlan(
        request,
        policy,
      );

    return this.executionStrategy.generate(
      plan,
    );
  }

  // ========================================================================
  // AUTOMATIC GENERATE
  // ========================================================================

  /**
   * Generate using automatic routing derived from the request.
   */
  public async generateAutomatic(
    request: AIRequest,
    options: AIRoutingPolicyOptions = {},
  ): Promise<AIResponse> {
    const plan =
      this.createPlanFromOptions(
        request,
        options,
      );

    return this.executionStrategy.generate(
      plan,
    );
  }

  // ========================================================================
  // LEGACY STREAM
  // ========================================================================

  /**
   * Stream using a legacy AIRoute.
   *
   * Streaming is explicitly required in the generated policy.
   */
  public stream(
    request: AIRequest,
    route: AIRoute,
  ): AsyncIterable<AIStreamChunk> {
    const policy =
      this.policyFromLegacyRoute({
        ...route,
        requireStreaming: true,
      });

    const plan =
      this.createPlan(
        request,
        policy,
      );

    return this.executionStrategy.stream(
      plan,
    );
  }

  // ========================================================================
  // AUTOMATIC STREAM
  // ========================================================================

  /**
   * Stream using automatic routing.
   *
   * Streaming is always added as a hard capability requirement.
   */
  public streamAutomatic(
    request: AIRequest,
    options: AIRoutingPolicyOptions = {},
  ): AsyncIterable<AIStreamChunk> {
    const basePolicy =
      createAIRoutingPolicyFromRequest(
        request,
        options,
      );

    const streamingPolicy =
      createAIRoutingPolicy({
        requirements: {
          ...basePolicy.requirements,
          streaming: true,
        },

        preferredProviders:
          basePolicy.preferredProviders,

        execution:
          basePolicy.execution,
      });

    const plan =
      this.createPlan(
        request,
        streamingPolicy,
      );

    return this.executionStrategy.stream(
      plan,
    );
  }

  // ========================================================================
  // EXECUTION STRATEGY
  // ========================================================================

  /**
   * Expose the configured execution strategy to higher-level orchestration
   * code without making AIRouter responsible for retry/fallback internals.
   */
  public getExecutionStrategy():
    AIExecutionStrategy {
    return this.executionStrategy;
  }
}
