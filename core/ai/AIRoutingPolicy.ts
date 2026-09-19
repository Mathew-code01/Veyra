
// ============================================================================
// FILE: core/ai/AIRoutingPolicy.ts
// PURPOSE:
// Defines the constraints and preferences used by AIRouter when selecting
// an AI provider.
//
// RESPONSIBILITIES:
// - Define capability requirements
// - Define runtime requirements
// - Define provider allow/deny lists
// - Define deterministic provider preferences
// - Define execution/retry constraints
// - Normalize and validate routing configuration
//
// NON-RESPONSIBILITIES:
// - Provider selection
// - Provider execution
// - Provider health probing
// - Retry execution
// - Fallback execution
// - Cloud transport
// - Local model loading
// - Hardware inspection
//
// ARCHITECTURE:
//
// AIRequest
//     │
//     ▼
// AIRoutingPolicy
//     │
//     ├── requirements
//     ├── preferences
//     └── execution constraints
//     │
//     ▼
// AIRoutingCandidate
//     │
//     ▼
// AIExecutionPlan
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
 * Provider health states relevant to routing.
 */
export type AIRoutingHealthStatus =
  | "healthy"
  | "degraded"
  | "unknown";

/**
 * User/configuration-facing provider preference.
 *
 * `priority` is optional at the input boundary.
 *
 * Lower values mean higher preference.
 *
 * Example:
 *
 * {
 *   provider: "cloud:gemini",
 *   priority: 0,
 * }
 */
export interface AIRoutingProviderPreference {
  readonly provider: string;
  readonly priority?: number;
}

/**
 * Normalized provider preference.
 *
 * This is deliberately separate from AIRoutingProviderPreference so the
 * routing engine never has to deal with an optional priority after policy
 * creation.
 */
export interface NormalizedAIRoutingProviderPreference {
  readonly provider: string;
  readonly priority: number;
}

/**
 * Requirements imposed on eligible providers.
 */
export interface AIRoutingRequirements {
  /**
   * Provider must support streaming.
   */
  readonly streaming?: boolean;

  /**
   * Provider must support vision.
   */
  readonly vision?: boolean;

  /**
   * Provider must support structured output.
   */
  readonly structuredOutput?: boolean;

  /**
   * Restrict execution to local or cloud providers.
   */
  readonly runtime?: AIRuntimeKind;

  /**
   * Only explicitly named providers may be selected.
   */
  readonly allowedProviders?: readonly string[];

  /**
   * Explicitly excluded providers.
   */
  readonly excludedProviders?: readonly string[];
}

/**
 * Execution constraints consumed by AIExecutionStrategy.
 */
export interface AIRoutingExecutionOptions {
  /**
   * Whether degraded providers may be selected.
   *
   * Default: true.
   */
  readonly allowDegraded?: boolean;

  /**
   * Whether providers whose supplied health state is unknown may be selected.
   *
   * Default: false.
   */
  readonly allowUnknownHealth?: boolean;

  /**
   * Whether execution may continue to another candidate after a provider
   * failure.
   *
   * Default: true.
   */
  readonly allowFallback?: boolean;

  /**
   * Maximum number of eligible candidates placed into the plan.
   *
   * Default: Number.MAX_SAFE_INTEGER.
   */
  readonly maxCandidates?: number;

  /**
   * Maximum attempts for one provider candidate.
   *
   * Default: 1.
   */
  readonly maxAttemptsPerCandidate?: number;

  /**
   * Base exponential retry delay in milliseconds.
   *
   * Default: 250.
   */
  readonly retryBaseDelayMs?: number;

  /**
   * Maximum exponential retry delay in milliseconds.
   *
   * Default: 5000.
   */
  readonly retryMaxDelayMs?: number;
}

/**
 * Caller-facing routing policy configuration.
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
 * Fully normalized immutable routing policy.
 *
 * The execution object is intentionally fully required after normalization.
 */
export interface AIRoutingPolicy {
  readonly requirements: Readonly<AIRoutingRequirements>;

  readonly preferredProviders:
    readonly NormalizedAIRoutingProviderPreference[];

  readonly execution: Readonly<{
    readonly allowDegraded: boolean;
    readonly allowUnknownHealth: boolean;
    readonly allowFallback: boolean;
    readonly maxCandidates: number;
    readonly maxAttemptsPerCandidate: number;
    readonly retryBaseDelayMs: number;
    readonly retryMaxDelayMs: number;
  }>;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_EXECUTION_OPTIONS = Object.freeze({
  allowDegraded: true,
  allowUnknownHealth: false,
  allowFallback: true,
  maxCandidates: Number.MAX_SAFE_INTEGER,
  maxAttemptsPerCandidate: 1,
  retryBaseDelayMs: 250,
  retryMaxDelayMs: 5_000,
});

// ============================================================================
// HELPERS
// ============================================================================

function normalizeProviderName(provider: string): string {
  const normalized = provider.trim();

  if (!normalized) {
    throw new Error(
      "Routing provider name cannot be empty.",
    );
  }

  return normalized;
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
      [
        "Routing policy value must be a positive integer.",
        `Received: ${String(value)}.`,
      ].join(" "),
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
      [
        "Routing delay must be a finite non-negative number.",
        `Received: ${String(value)}.`,
      ].join(" "),
    );
  }

  return Math.floor(value);
}

function normalizePreferences(
  preferences:
    | AIRoutingPolicyOptions["preferredProviders"]
    | undefined,
): readonly NormalizedAIRoutingProviderPreference[] {
  if (!preferences || preferences.length === 0) {
    return Object.freeze([]);
  }

  const result: NormalizedAIRoutingProviderPreference[] = [];

  const seen = new Set<string>();

  preferences.forEach((entry, index) => {
    const provider =
      typeof entry === "string"
        ? entry
        : entry.provider;

    const normalizedProvider =
      normalizeProviderName(provider);

    if (seen.has(normalizedProvider)) {
      return;
    }

    seen.add(normalizedProvider);

    const configuredPriority =
      typeof entry === "string"
        ? undefined
        : entry.priority;

    const priority =
      configuredPriority ?? index;

    if (
      !Number.isInteger(priority) ||
      priority < 0
    ) {
      throw new Error(
        [
          "Routing provider priority must be a",
          "non-negative integer.",
          `Received: ${String(priority)}.`,
        ].join(" "),
      );
    }

    result.push(
      Object.freeze({
        provider: normalizedProvider,
        priority,
      }),
    );
  });

  result.sort(
    (a, b) =>
      a.priority - b.priority ||
      a.provider.localeCompare(b.provider),
  );

  return Object.freeze(result);
}

function normalizeProviderList(
  providers:
    | readonly string[]
    | undefined,
): readonly string[] | undefined {
  if (providers === undefined) {
    return undefined;
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const provider of providers) {
    const normalized =
      normalizeProviderName(provider);

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return Object.freeze(result);
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a normalized immutable routing policy.
 */
export function createAIRoutingPolicy(
  options: AIRoutingPolicyOptions = {},
): AIRoutingPolicy {
  const inputRequirements =
    options.requirements ?? {};

  if (
    inputRequirements.runtime !== undefined &&
    inputRequirements.runtime !== "local" &&
    inputRequirements.runtime !== "cloud"
  ) {
    throw new Error(
      `Unsupported routing runtime: ${String(
        inputRequirements.runtime,
      )}.`,
    );
  }

  const allowedProviders =
    normalizeProviderList(
      inputRequirements.allowedProviders,
    );

  const excludedProviders =
    normalizeProviderList(
      inputRequirements.excludedProviders,
    );

  const executionInput =
    options.execution ?? {};

  const maxCandidates =
    normalizePositiveInteger(
      executionInput.maxCandidates,
      DEFAULT_EXECUTION_OPTIONS.maxCandidates,
    );

  const maxAttemptsPerCandidate =
    normalizePositiveInteger(
      executionInput.maxAttemptsPerCandidate,
      DEFAULT_EXECUTION_OPTIONS.maxAttemptsPerCandidate,
    );

  const retryBaseDelayMs =
    normalizeDelay(
      executionInput.retryBaseDelayMs,
      DEFAULT_EXECUTION_OPTIONS.retryBaseDelayMs,
    );

  const retryMaxDelayMs =
    normalizeDelay(
      executionInput.retryMaxDelayMs,
      DEFAULT_EXECUTION_OPTIONS.retryMaxDelayMs,
    );

  if (
    retryMaxDelayMs < retryBaseDelayMs
  ) {
    throw new Error(
      [
        "Routing retryMaxDelayMs cannot be",
        "smaller than retryBaseDelayMs.",
      ].join(" "),
    );
  }

  const requirements: AIRoutingRequirements =
    Object.freeze({
      ...(inputRequirements.streaming !== undefined
        ? {
            streaming:
              inputRequirements.streaming,
          }
        : {}),

      ...(inputRequirements.vision !== undefined
        ? {
            vision:
              inputRequirements.vision,
          }
        : {}),

      ...(inputRequirements.structuredOutput !== undefined
        ? {
            structuredOutput:
              inputRequirements.structuredOutput,
          }
        : {}),

      ...(inputRequirements.runtime !== undefined
        ? {
            runtime:
              inputRequirements.runtime,
          }
        : {}),

      ...(allowedProviders !== undefined
        ? {
            allowedProviders,
          }
        : {}),

      ...(excludedProviders !== undefined
        ? {
            excludedProviders,
          }
        : {}),
    });

  return Object.freeze({
    requirements,

    preferredProviders:
      normalizePreferences(
        options.preferredProviders,
      ),

    execution: Object.freeze({
      allowDegraded:
        executionInput.allowDegraded ??
        DEFAULT_EXECUTION_OPTIONS.allowDegraded,

      allowUnknownHealth:
        executionInput.allowUnknownHealth ??
        DEFAULT_EXECUTION_OPTIONS.allowUnknownHealth,

      allowFallback:
        executionInput.allowFallback ??
        DEFAULT_EXECUTION_OPTIONS.allowFallback,

      maxCandidates,

      maxAttemptsPerCandidate,

      retryBaseDelayMs,

      retryMaxDelayMs,
    }),
  });
}

/**
 * Derive deterministic routing requirements from an AI request.
 *
 * Important:
 * This function does not force streaming because the same request can be
 * executed through either generate() or stream(). The caller should enable
 * streaming explicitly for streaming execution.
 */
export function createAIRoutingPolicyFromRequest(
  request: AIRequest,
  options: Omit<
    AIRoutingPolicyOptions,
    "requirements"
  > = {},
): AIRoutingPolicy {
  return createAIRoutingPolicy({
    ...options,

    requirements: {
      vision:
        request.vision !== undefined,

      structuredOutput:
        request.options?.responseFormat ===
        "json",
    },
  });
}

// ============================================================================
// POLICY UTILITIES
// ============================================================================

/**
 * Determine whether a provider name is permitted by allow/deny rules.
 *
 * Exclusions always win over allow-list membership.
 */
export function isProviderAllowedByPolicy(
  providerName: string,
  policy: AIRoutingPolicy,
): boolean {
  const normalized =
    normalizeProviderName(providerName);

  const allowed =
    policy.requirements.allowedProviders;

  if (
    allowed !== undefined &&
    allowed.length > 0 &&
    !allowed.includes(normalized)
  ) {
    return false;
  }

  const excluded =
    policy.requirements.excludedProviders;

  if (
    excluded !== undefined &&
    excluded.includes(normalized)
  ) {
    return false;
  }

  return true;
}

/**
 * Return the configured provider preference priority.
 *
 * Providers without an explicit preference receive the largest possible
 * priority value, meaning they rank behind explicitly preferred providers.
 */
export function getProviderPreferencePriority(
  providerName: string,
  policy: AIRoutingPolicy,
): number {
  const normalized =
    normalizeProviderName(providerName);

  const preference =
    policy.preferredProviders.find(
      (candidate) =>
        candidate.provider === normalized,
    );

  return preference?.priority ??
    Number.MAX_SAFE_INTEGER;
}

/**
 * Determine whether the policy explicitly prefers a provider.
 */
export function isProviderPreferred(
  providerName: string,
  policy: AIRoutingPolicy,
): boolean {
  const normalized =
    normalizeProviderName(providerName);

  return policy.preferredProviders.some(
    (candidate) =>
      candidate.provider === normalized,
  );
}
