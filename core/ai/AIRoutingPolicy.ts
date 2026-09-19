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
export type AIRoutingHealthStatus = "healthy" | "degraded" | "unknown";

/**
 * User/configuration-facing provider preference.
 */
export interface AIRoutingProviderPreference {
  readonly provider: string;

  /**
   * Lower values mean higher preference.
   */
  readonly priority?: number;
}

/**
 * Normalized provider preference.
 */
export interface NormalizedAIRoutingProviderPreference {
  readonly provider: string;

  readonly priority: number;
}

/**
 * Requirements imposed on eligible providers.
 */
export interface AIRoutingRequirements {
  readonly streaming?: boolean;

  readonly vision?: boolean;

  readonly structuredOutput?: boolean;

  readonly runtime?: AIRuntimeKind;

  readonly allowedProviders?: readonly string[];

  readonly excludedProviders?: readonly string[];
}

/**
 * Execution constraints consumed by AIExecutionStrategy.
 */
export interface AIRoutingExecutionOptions {
  readonly allowDegraded?: boolean;

  readonly allowUnknownHealth?: boolean;

  readonly allowFallback?: boolean;

  readonly maxCandidates?: number;

  readonly maxAttemptsPerCandidate?: number;

  readonly retryBaseDelayMs?: number;

  readonly retryMaxDelayMs?: number;
}

/**
 * Caller-facing routing policy configuration.
 */
export interface AIRoutingPolicyOptions {
  readonly requirements?: AIRoutingRequirements;

  readonly preferredProviders?: readonly (
    string | AIRoutingProviderPreference
  )[];

  readonly execution?: AIRoutingExecutionOptions;
}

/**
 * Fully normalized immutable routing policy.
 */
export interface AIRoutingPolicy {
  readonly requirements: Readonly<AIRoutingRequirements>;

  readonly preferredProviders: readonly NormalizedAIRoutingProviderPreference[];

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
  if (typeof provider !== "string") {
    throw new Error("Routing provider name must be a string.");
  }

  const normalized = provider.trim();

  if (!normalized) {
    throw new Error("Routing provider name cannot be empty.");
  }

  return normalized;
}

function normalizeBoolean(
  value: boolean | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Routing policy "${name}" must be a boolean.`);
  }

  return value;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      [
        `Routing policy "${name}" must be a positive safe integer.`,
        `Received: ${String(value)}.`,
      ].join(" "),
    );
  }

  return value;
}

function normalizeDelay(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      [
        `Routing policy "${name}" must be a finite non-negative number.`,
        `Received: ${String(value)}.`,
      ].join(" "),
    );
  }

  return Math.floor(value);
}

function normalizePreferences(
  preferences: AIRoutingPolicyOptions["preferredProviders"] | undefined,
): readonly NormalizedAIRoutingProviderPreference[] {
  if (!preferences || preferences.length === 0) {
    return Object.freeze([]);
  }

  const result: NormalizedAIRoutingProviderPreference[] = [];

  const seen = new Set<string>();

  preferences.forEach((entry, index) => {
    const provider = typeof entry === "string" ? entry : entry?.provider;

    const normalizedProvider = normalizeProviderName(provider);

    if (seen.has(normalizedProvider)) {
      return;
    }

    seen.add(normalizedProvider);

    const configuredPriority =
      typeof entry === "string" ? undefined : entry.priority;

    const priority = configuredPriority ?? index;

    if (!Number.isSafeInteger(priority) || priority < 0) {
      throw new Error(
        [
          "Routing provider priority must be a",
          "non-negative safe integer.",
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
    (a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider),
  );

  return Object.freeze(result);
}

function normalizeProviderList(
  providers: readonly string[] | undefined,
): readonly string[] | undefined {
  if (providers === undefined) {
    return undefined;
  }

  const seen = new Set<string>();

  const result: string[] = [];

  for (const provider of providers) {
    const normalized = normalizeProviderName(provider);

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
  const inputRequirements = options.requirements ?? {};

  if (
    inputRequirements.runtime !== undefined &&
    inputRequirements.runtime !== "local" &&
    inputRequirements.runtime !== "cloud"
  ) {
    throw new Error(
      `Unsupported routing runtime: ${String(inputRequirements.runtime)}.`,
    );
  }

  if (
    inputRequirements.streaming !== undefined &&
    typeof inputRequirements.streaming !== "boolean"
  ) {
    throw new Error('Routing requirement "streaming" must be a boolean.');
  }

  if (
    inputRequirements.vision !== undefined &&
    typeof inputRequirements.vision !== "boolean"
  ) {
    throw new Error('Routing requirement "vision" must be a boolean.');
  }

  if (
    inputRequirements.structuredOutput !== undefined &&
    typeof inputRequirements.structuredOutput !== "boolean"
  ) {
    throw new Error(
      'Routing requirement "structuredOutput" must be a boolean.',
    );
  }

  const allowedProviders = normalizeProviderList(
    inputRequirements.allowedProviders,
  );

  const excludedProviders = normalizeProviderList(
    inputRequirements.excludedProviders,
  );

  const executionInput = options.execution ?? {};

  const maxCandidates = normalizePositiveInteger(
    executionInput.maxCandidates,
    DEFAULT_EXECUTION_OPTIONS.maxCandidates,
    "maxCandidates",
  );

  const maxAttemptsPerCandidate = normalizePositiveInteger(
    executionInput.maxAttemptsPerCandidate,
    DEFAULT_EXECUTION_OPTIONS.maxAttemptsPerCandidate,
    "maxAttemptsPerCandidate",
  );

  const retryBaseDelayMs = normalizeDelay(
    executionInput.retryBaseDelayMs,
    DEFAULT_EXECUTION_OPTIONS.retryBaseDelayMs,
    "retryBaseDelayMs",
  );

  const retryMaxDelayMs = normalizeDelay(
    executionInput.retryMaxDelayMs,
    DEFAULT_EXECUTION_OPTIONS.retryMaxDelayMs,
    "retryMaxDelayMs",
  );

  if (retryMaxDelayMs < retryBaseDelayMs) {
    throw new Error(
      [
        "Routing retryMaxDelayMs cannot be",
        "smaller than retryBaseDelayMs.",
      ].join(" "),
    );
  }

  const requirements: AIRoutingRequirements = Object.freeze({
    ...(inputRequirements.streaming !== undefined
      ? {
          streaming: inputRequirements.streaming,
        }
      : {}),

    ...(inputRequirements.vision !== undefined
      ? {
          vision: inputRequirements.vision,
        }
      : {}),

    ...(inputRequirements.structuredOutput !== undefined
      ? {
          structuredOutput: inputRequirements.structuredOutput,
        }
      : {}),

    ...(inputRequirements.runtime !== undefined
      ? {
          runtime: inputRequirements.runtime,
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

    preferredProviders: normalizePreferences(options.preferredProviders),

    execution: Object.freeze({
      allowDegraded: normalizeBoolean(
        executionInput.allowDegraded,
        DEFAULT_EXECUTION_OPTIONS.allowDegraded,
        "allowDegraded",
      ),

      allowUnknownHealth: normalizeBoolean(
        executionInput.allowUnknownHealth,
        DEFAULT_EXECUTION_OPTIONS.allowUnknownHealth,
        "allowUnknownHealth",
      ),

      allowFallback: normalizeBoolean(
        executionInput.allowFallback,
        DEFAULT_EXECUTION_OPTIONS.allowFallback,
        "allowFallback",
      ),

      maxCandidates,

      maxAttemptsPerCandidate,

      retryBaseDelayMs,

      retryMaxDelayMs,
    }),
  });
}

// ============================================================================
// POLICY FROM REQUEST
// ============================================================================

/**
 * Derive deterministic routing requirements from an AI request.
 *
 * Important:
 * This function does not automatically require streaming because the same
 * request can be executed through either generate() or stream().
 */
export function createAIRoutingPolicyFromRequest(
  request: AIRequest,
  options: Omit<AIRoutingPolicyOptions, "requirements"> = {},
): AIRoutingPolicy {
  if (!request) {
    throw new Error("Cannot create a routing policy without an AI request.");
  }

  return createAIRoutingPolicy({
    ...options,

    requirements: {
      vision: request.vision !== undefined,

      structuredOutput: request.options?.responseFormat === "json",
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
  const normalized = normalizeProviderName(providerName);

  const allowed = policy.requirements.allowedProviders;

  if (
    allowed !== undefined &&
    allowed.length > 0 &&
    !allowed.includes(normalized)
  ) {
    return false;
  }

  const excluded = policy.requirements.excludedProviders;

  if (excluded !== undefined && excluded.includes(normalized)) {
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
  const normalized = normalizeProviderName(providerName);

  const preference = policy.preferredProviders.find(
    (candidate) => candidate.provider === normalized,
  );

  return preference?.priority ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Determine whether the policy explicitly prefers a provider.
 */
export function isProviderPreferred(
  providerName: string,
  policy: AIRoutingPolicy,
): boolean {
  const normalized = normalizeProviderName(providerName);

  return policy.preferredProviders.some(
    (candidate) => candidate.provider === normalized,
  );
}
