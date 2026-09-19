
// ============================================================================
// FILE: core/ai/AIRoutingPolicy.ts
// PURPOSE:
// Defines the constraints and preferences used by AIRouter when selecting
// an AI provider.
//
// ARCHITECTURE:
//
// AIRequest
//     │
//     ▼
// AIRoutingPolicy
//     │
//     ├── capability requirements
//     ├── runtime requirements
//     ├── provider preferences
//     ├── provider exclusions
//     └── execution constraints
//     │
//     ▼
// AIRoutingCandidate[]
//
// IMPORTANT:
//
// AIRoutingPolicy does NOT:
// - execute providers
// - perform retries
// - perform fallback
// - access CloudProviderRegistry
// - access ModelManager
// - inspect hardware directly
// - perform provider-specific API calls
//
// Those responsibilities belong to their respective layers.
// ============================================================================

import type { AIRequest } from "./AIRequest";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Runtime category understood by the generic AI layer.
 */
export type AIRuntimeKind = "local" | "cloud";

/**
 * Health states that may be accepted by the router.
 *
 * "healthy" is the normal production state.
 *
 * "degraded" can be explicitly allowed because a degraded provider may
 * still be capable of serving a request.
 */
export type AIRoutingHealthStatus = "healthy" | "degraded" | "unknown";

/**
 * Provider preference.
 *
 * Lower numeric priority means higher preference.
 *
 * Example:
 *
 * preferredProviders: [
 *   { provider: "local", priority: 0 },
 *   { provider: "cloud:gemini", priority: 10 }
 * ]
 */
export interface AIRoutingProviderPreference {
  readonly provider: string;

  readonly priority?: number;
}

/**
 * Requirements imposed on the selected provider.
 */
export interface AIRoutingRequirements {
  /**
   * Request requires streaming capability.
   */
  readonly streaming?: boolean;

  /**
   * Request contains or requires image understanding.
   */
  readonly vision?: boolean;

  /**
   * Request requires structured output.
   */
  readonly structuredOutput?: boolean;

  /**
   * Restrict routing to a runtime category.
   */
  readonly runtime?: AIRuntimeKind;

  /**
   * Only allow explicitly named providers.
   *
   * When supplied, providers outside this list are rejected.
   */
  readonly allowedProviders?: readonly string[];

  /**
   * Providers that must never be selected.
   */
  readonly excludedProviders?: readonly string[];
}

/**
 * Execution-level routing constraints.
 */
export interface AIRoutingExecutionOptions {
  /**
   * Whether degraded providers may be selected.
   *
   * Defaults to true.
   */
  readonly allowDegraded?: boolean;

  /**
   * Whether providers with unknown health may be selected.
   *
   * Defaults to false.
   */
  readonly allowUnknownHealth?: boolean;

  /**
   * Maximum number of provider candidates to place into an execution plan.
   *
   * Defaults to all eligible providers.
   */
  readonly maxCandidates?: number;

  /**
   * Maximum attempts for the same candidate.
   *
   * Defaults to 1.
   *
   * Retry behavior is implemented by AIExecutionStrategy.
   */
  readonly maxAttemptsPerCandidate?: number;

  /**
   * Base delay used by AIExecutionStrategy when retrying.
   *
   * Defaults to 250ms.
   */
  readonly retryBaseDelayMs?: number;

  /**
   * Maximum retry delay.
   *
   * Defaults to 5000ms.
   */
  readonly retryMaxDelayMs?: number;
}

/**
 * Complete routing policy.
 */
export interface AIRoutingPolicyOptions {
  readonly requirements?: AIRoutingRequirements;

  readonly preferredProviders?: readonly (
    | string
    | AIRoutingProviderPreference
  )[];

  readonly execution?: AIRoutingExecutionOptions;
}

/**
 * Immutable normalized routing policy.
 */
export interface AIRoutingPolicy {
  readonly requirements: Readonly<AIRoutingRequirements>;

  readonly preferredProviders: readonly AIRoutingProviderPreference[];

  readonly execution: Readonly<Required<AIRoutingExecutionOptions>>;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_EXECUTION_OPTIONS: Required<AIRoutingExecutionOptions> = {
  allowDegraded: true,

  allowUnknownHealth: false,

  maxCandidates: Number.MAX_SAFE_INTEGER,

  maxAttemptsPerCandidate: 1,

  retryBaseDelayMs: 250,

  retryMaxDelayMs: 5_000,
};

// ============================================================================
// HELPERS
// ============================================================================

function normalizeProviderName(provider: string): string {
  const normalized = provider.trim();

  if (!normalized) {
    throw new Error("Routing provider name cannot be empty.");
  }

  return normalized;
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Routing policy value must be a non-negative integer. Received: ${String(
        value,
      )}.`,
    );
  }

  return value;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Routing policy value must be a positive integer. Received: ${String(
        value,
      )}.`,
    );
  }

  return value;
}

function normalizeDelay(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Routing delay must be a finite non-negative number. Received: ${String(
        value,
      )}.`,
    );
  }

  return Math.floor(value);
}

function normalizePreferences(
  preferences: AIRoutingPolicyOptions["preferredProviders"],
): readonly AIRoutingProviderPreference[] {
  if (!preferences || preferences.length === 0) {
    return Object.freeze([]);
  }

  const result: AIRoutingProviderPreference[] = [];

  const seen = new Set<string>();

  preferences.forEach((entry, index) => {
    const provider =
      typeof entry === "string" ? entry : entry.provider;

    const normalizedProvider = normalizeProviderName(provider);

    if (seen.has(normalizedProvider)) {
      return;
    }

    seen.add(normalizedProvider);

    const configuredPriority =
      typeof entry === "string"
        ? undefined
        : entry.priority;

    const priority =
      configuredPriority === undefined
        ? index
        : configuredPriority;

    if (!Number.isInteger(priority)) {
      throw new Error(
        `Routing provider priority must be an integer. Received: ${String(
          priority,
        )}.`,
      );
    }

    result.push(
      Object.freeze({
        provider: normalizedProvider,
        priority,
      }),
    );
  });

  return Object.freeze(
    result.sort((a, b) => a.priority - b.priority),
  );
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a normalized immutable routing policy.
 *
 * This is the preferred construction API.
 */
export function createAIRoutingPolicy(
  options: AIRoutingPolicyOptions = {},
): AIRoutingPolicy {
  const requirements = options.requirements ?? {};

  const allowedProviders =
    requirements.allowedProviders === undefined
      ? undefined
      : Object.freeze(
          requirements.allowedProviders.map(normalizeProviderName),
        );

  const excludedProviders =
    requirements.excludedProviders === undefined
      ? undefined
      : Object.freeze(
          requirements.excludedProviders.map(normalizeProviderName),
        );

  if (
    requirements.runtime !== undefined &&
    requirements.runtime !== "local" &&
    requirements.runtime !== "cloud"
  ) {
    throw new Error(
      `Unsupported routing runtime: ${String(requirements.runtime)}.`,
    );
  }

  const executionInput = options.execution ?? {};

  const maxCandidates = normalizePositiveInteger(
    executionInput.maxCandidates === Number.MAX_SAFE_INTEGER
      ? undefined
      : executionInput.maxCandidates,
    DEFAULT_EXECUTION_OPTIONS.maxCandidates,
  );

  const maxAttemptsPerCandidate = normalizePositiveInteger(
    executionInput.maxAttemptsPerCandidate,
    DEFAULT_EXECUTION_OPTIONS.maxAttemptsPerCandidate,
  );

  const retryBaseDelayMs = normalizeDelay(
    executionInput.retryBaseDelayMs,
    DEFAULT_EXECUTION_OPTIONS.retryBaseDelayMs,
  );

  const retryMaxDelayMs = normalizeDelay(
    executionInput.retryMaxDelayMs,
    DEFAULT_EXECUTION_OPTIONS.retryMaxDelayMs,
  );

  if (retryMaxDelayMs < retryBaseDelayMs) {
    throw new Error(
      "Routing retryMaxDelayMs cannot be smaller than retryBaseDelayMs.",
    );
  }

  return Object.freeze({
    requirements: Object.freeze({
      ...requirements,

      ...(allowedProviders !== undefined
        ? { allowedProviders }
        : {}),

      ...(excludedProviders !== undefined
        ? { excludedProviders }
        : {}),
    }),

    preferredProviders: normalizePreferences(
      options.preferredProviders,
    ),

    execution: Object.freeze({
      allowDegraded:
        executionInput.allowDegraded ??
        DEFAULT_EXECUTION_OPTIONS.allowDegraded,

      allowUnknownHealth:
        executionInput.allowUnknownHealth ??
        DEFAULT_EXECUTION_OPTIONS.allowUnknownHealth,

      maxCandidates,

      maxAttemptsPerCandidate,

      retryBaseDelayMs,

      retryMaxDelayMs,
    }),
  });
}

/**
 * Create a routing policy from an AIRequest.
 *
 * This keeps request-derived requirements deterministic:
 *
 * - vision request -> vision capability required
 * - no explicit streaming flag -> streaming is not required
 */
export function createAIRoutingPolicyFromRequest(
  request: AIRequest,
  options: Omit<AIRoutingPolicyOptions, "requirements"> = {},
): AIRoutingPolicy {
  return createAIRoutingPolicy({
    ...options,

    requirements: {
      vision: request.vision !== undefined,

      ...(request.options?.responseFormat === "json"
        ? {
            structuredOutput: true,
          }
        : {}),
    },
  });
}

// ============================================================================
// POLICY UTILITIES
// ============================================================================

/**
 * Check whether a provider name is explicitly allowed.
 */
export function isProviderAllowedByPolicy(
  providerName: string,
  policy: AIRoutingPolicy,
): boolean {
  const normalized = normalizeProviderName(providerName);

  const allowed = policy.requirements.allowedProviders;

  if (allowed && allowed.length > 0 && !allowed.includes(normalized)) {
    return false;
  }

  const excluded = policy.requirements.excludedProviders;

  if (excluded?.includes(normalized)) {
    return false;
  }

  return true;
}

/**
 * Return the configured preference priority for a provider.
 *
 * Providers without an explicit preference receive the lowest preference
 * priority after all explicitly preferred providers.
 */
export function getProviderPreferencePriority(
  providerName: string,
  policy: AIRoutingPolicy,
): number {
  const normalized = normalizeProviderName(providerName);

  const preference = policy.preferredProviders.find(
    (candidate) => candidate.provider === normalized,
  );

  if (preference) {
    return preference.priority;
  }

  return Number.MAX_SAFE_INTEGER;
}
