
// ============================================================================
// FILE: core/ai/AIManager.ts
//
// PURPOSE:
// Central registry and execution entry point for all Veyra AI providers.
//
// ARCHITECTURE:
//
//                         AIRequest
//                             │
//                             ▼
//                          AIRouter
//                             │
//                   explicit provider/model
//                             │
//                             ▼
//                         AIManager
//                             │
//                    ReliabilityManager
//                             │
//              ┌──────────────┴──────────────┐
//              ▼                             ▼
//      LocalModelProvider             CloudAIProvider
//              │                             │
//              ▼                             ▼
//       ModelManager / Runtime       CloudGateway
//                                            │
//                                            ▼
//                                  CloudProviderRegistry
//
// IMPORTANT:
//
// AIManager owns:
// - provider registration
// - provider lookup
// - provider execution access
// - reliability boundary for AI execution
//
// AIManager does NOT:
// - build prompts
// - retrieve context
// - classify interview questions
// - select interview context
// - rank cloud providers
// - implement provider transport
// - implement local model runtimes
// - contain provider-specific retry rules
//
// Routing belongs to AIRouter.
// Reliability belongs to core/reliability.
// Provider execution belongs to AIProvider implementations.
// ============================================================================

import type { AIProvider } from "./AIProvider";

import type { AIRequest } from "./AIRequest";

import type { AIResponse, AIStreamChunk } from "./AIResponse";

import { AIError } from "./AIError";

import type { ModelManager } from "../models/ModelManager";

import {
  LocalModelProvider,
  type LocalModelProviderOptions,
} from "./LocalModelProvider";

import {
  CloudAIProvider,
  type CloudAIProviderOptions,
} from "./CloudAIProvider";

import { CloudGateway } from "../cloud/CloudGateway";

import type { CloudProviderRegistry } from "../cloud/CloudProviderRegistry";

import {
  ReliabilityManager,
  type ReliableExecutionOptions,
} from "../reliability/ReliabilityManager";

import type { OperationContext } from "../reliability/execution/OperationContext";

// ============================================================================
// TYPES
// ============================================================================

export interface AIManagerRegisterOptions {
  /**
   * Replace an existing provider with the same name.
   *
   * Defaults to true.
   */
  readonly replaceExisting?: boolean;
}

export interface AIManagerCloudProviderOptions
  extends CloudAIProviderOptions, AIManagerRegisterOptions {}

/**
 * Reliability configuration supplied to AIManager.
 *
 * ReliabilityManager remains the owner of:
 * - retry
 * - timeout
 * - recovery
 * - failure classification
 * - operation lifecycle
 *
 * AIManager only supplies AI-specific execution metadata.
 */
export interface AIManagerReliabilityOptions {
  /**
   * Shared reliability manager.
   *
   * If omitted, AIManager creates its own instance.
   */
  readonly manager?: ReliabilityManager;

  /**
   * Default timeout for AI generation.
   *
   * A request-level timeout still takes precedence.
   */
  readonly timeoutMs?: number;

  /**
   * Whether failed executions should enter recovery.
   *
   * Defaults to true.
   */
  readonly recover?: boolean;

  /**
   * Optional base reliability configuration.
   *
   * IMPORTANT:
   *
   * componentId is intentionally excluded here because AIManager owns
   * the component identity for AI operations.
   *
   * operationId is also excluded because ReliabilityManager creates the
   * operation unless an upper-level operation explicitly owns it.
   */
  readonly execution?: Omit<
    ReliableExecutionOptions,
    "operationId" | "componentId" | "timeoutMs"
  >;
}

/**
 * Options controlling a single AI generation call.
 */
export interface AIGenerationOptions {
  /**
   * Disable reliability wrapping for this execution.
   *
   * This should normally remain false.
   *
   * It exists for exceptional internal cases where another reliability
   * boundary already owns the operation.
   */
  readonly bypassReliability?: boolean;

  /**
   * Optional reliability configuration for this execution.
   *
   * AIManager owns componentId, so callers cannot accidentally provide an
   * undefined componentId.
   */
  readonly reliability?: Omit<
    ReliableExecutionOptions,
    "operationId" | "componentId" | "timeoutMs"
  >;

  /**
   * Override the timeout for this execution.
   */
  readonly timeoutMs?: number;
}

// ============================================================================
// AI MANAGER
// ============================================================================

export class AIManager {
  /**
   * All providers are stored behind the common AIProvider abstraction.
   */
  private readonly providers = new Map<string, AIProvider>();

  /**
   * Central reliability boundary for AI execution.
   *
   * AIManager owns the dependency.
   *
   * ReliabilityManager does NOT import AIManager.
   */
  private readonly reliabilityManager: ReliabilityManager;

  /**
   * Default reliability configuration for AI operations.
   */
  private readonly reliabilityOptions: AIManagerReliabilityOptions;

  // ==========================================================================

  public constructor(reliabilityOptions: AIManagerReliabilityOptions = {}) {
    this.reliabilityOptions = Object.freeze({
      ...reliabilityOptions,
    });

    this.reliabilityManager =
      reliabilityOptions.manager ?? new ReliabilityManager();
  }

  // ==========================================================================
  // PROVIDER REGISTRATION
  // ==========================================================================

  /**
   * Register any Veyra AI provider.
   *
   * This is the canonical registration path for all providers.
   */
  public register(
    provider: AIProvider,
    options: AIManagerRegisterOptions = {},
  ): void {
    if (!provider) {
      throw new AIError(
        "Cannot register an undefined AI provider.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    const name = typeof provider.name === "string" ? provider.name.trim() : "";

    if (!name) {
      throw new AIError(
        "AI provider name cannot be empty.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    if (!provider.capabilities || typeof provider.capabilities !== "object") {
      throw new AIError(
        `AI provider "${name}" has invalid capabilities.`,
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            provider: name,
          },
        },
      );
    }

    if (typeof provider.generate !== "function") {
      throw new AIError(
        `AI provider "${name}" does not implement generate().`,
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            provider: name,
          },
        },
      );
    }

    if (typeof provider.stream !== "function") {
      throw new AIError(
        `AI provider "${name}" does not implement stream().`,
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            provider: name,
          },
        },
      );
    }

    if (typeof provider.healthCheck !== "function") {
      throw new AIError(
        `AI provider "${name}" does not implement healthCheck().`,
        "INVALID_REQUEST",
        {
          retryable: false,
          details: {
            provider: name,
          },
        },
      );
    }

    const existing = this.providers.get(name);

    if (existing && options.replaceExisting === false) {
      throw new AIError(
        `AI provider "${name}" is already registered.`,
        "PROVIDER",
        {
          retryable: false,
          details: {
            provider: name,
          },
        },
      );
    }

    this.providers.set(name, provider);
  }

  /**
   * Remove a registered provider.
   */
  public unregister(providerName: string): void {
    const name = providerName.trim();

    if (!name) {
      return;
    }

    this.providers.delete(name);
  }

  /**
   * Check whether a provider is registered.
   */
  public has(providerName: string): boolean {
    const name = providerName.trim();

    if (!name) {
      return false;
    }

    return this.providers.has(name);
  }

  /**
   * Retrieve a registered provider.
   */
  public get(providerName: string): AIProvider {
    const name = providerName.trim();

    if (!name) {
      throw new AIError(
        "AI provider name cannot be empty.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw new AIError(
        `AI provider "${name}" is not registered.`,
        "UNAVAILABLE",
        {
          retryable: false,
          details: {
            provider: name,
          },
        },
      );
    }

    return provider;
  }

  /**
   * Return a readonly snapshot of all registered providers.
   */
  public list(): readonly AIProvider[] {
    return Object.freeze([...this.providers.values()]);
  }

  // ==========================================================================
  // RELIABILITY
  // ==========================================================================

  /**
   * Return the reliability manager used by AI execution.
   *
   * The returned instance is shared by all AI operations handled by this
   * manager.
   */
  public getReliabilityManager(): ReliabilityManager {
    return this.reliabilityManager;
  }

  // ==========================================================================
  // LOCAL MODEL CONNECTION
  // ==========================================================================

  public registerLocalModelProvider(
    modelManager: ModelManager,
    options: LocalModelProviderOptions = {},
  ): LocalModelProvider {
    if (!modelManager) {
      throw new AIError(
        "A ModelManager is required to register the local AI provider.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    const provider = new LocalModelProvider(modelManager, options);

    this.register(provider);

    return provider;
  }

  public unregisterLocalModelProvider(providerName = "local"): void {
    this.unregister(providerName);
  }

  public getLocalModelProvider(providerName = "local"): LocalModelProvider {
    const provider = this.get(providerName);

    if (!(provider instanceof LocalModelProvider)) {
      throw new AIError(
        `Provider "${providerName}" is registered but is not a Veyra LocalModelProvider.`,
        "PROVIDER",
        {
          retryable: false,
          details: {
            provider: providerName,
            expectedRuntime: "local",
          },
        },
      );
    }

    return provider;
  }

  // ==========================================================================
  // CLOUD PROVIDER CONNECTION
  // ==========================================================================

  public registerCloudAIProvider(
    options: AIManagerCloudProviderOptions,
  ): CloudAIProvider {
    if (!options) {
      throw new AIError(
        "Cloud AI provider options are required.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    const { replaceExisting = true, ...providerOptions } = options;

    const provider = new CloudAIProvider(providerOptions);

    this.register(provider, {
      replaceExisting,
    });

    return provider;
  }

  public registerCloudAIProviderFromRegistry(
    registry: CloudProviderRegistry,
    options: Omit<AIManagerCloudProviderOptions, "registry">,
  ): CloudAIProvider {
    if (!registry) {
      throw new AIError(
        "A CloudProviderRegistry is required to register a cloud AI provider.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    return this.registerCloudAIProvider({
      ...options,
      registry,
    });
  }

  public registerCloudAIProviderFromGateway(
    gateway: CloudGateway,
    options: Omit<AIManagerCloudProviderOptions, "gateway">,
  ): CloudAIProvider {
    if (!gateway) {
      throw new AIError(
        "A CloudGateway is required to register a cloud AI provider.",
        "INVALID_REQUEST",
        {
          retryable: false,
        },
      );
    }

    return this.registerCloudAIProvider({
      ...options,
      gateway,
    });
  }

  public unregisterCloudAIProvider(providerName: string): void {
    this.unregister(providerName);
  }

  public getCloudAIProvider(providerName: string): CloudAIProvider {
    const provider = this.get(providerName);

    if (!(provider instanceof CloudAIProvider)) {
      throw new AIError(
        `Provider "${providerName}" is registered but is not a Veyra CloudAIProvider.`,
        "PROVIDER",
        {
          retryable: false,
          details: {
            provider: providerName,
            expectedRuntime: "cloud",
          },
        },
      );
    }

    return provider;
  }

  // ==========================================================================
  // GENERATION
  // ==========================================================================

  /**
   * Execute a non-streaming request through an explicitly selected provider.
   *
   * Routing belongs to AIRouter.
   *
   * Reliability belongs to ReliabilityManager.
   *
   * Therefore the actual execution path is:
   *
   *   AIManager
   *       ↓
   *   ReliabilityManager
   *       ↓
   *   AIProvider.generate()
   */
  public async generate(
    providerName: string,
    request: AIRequest,
    options: AIGenerationOptions = {},
  ): Promise<AIResponse> {
    if (!request) {
      throw new AIError("AI request is required.", "INVALID_REQUEST", {
        retryable: false,
      });
    }

    const provider = this.get(providerName);

    /**
     * Allow an already-managed upper-level operation to bypass this boundary.
     *
     * This prevents accidental double retry/timeout layers.
     */
    if (options.bypassReliability === true) {
      return provider.generate(request);
    }

    const timeoutMs =
      options.timeoutMs ??
      request.timeoutMs ??
      this.reliabilityOptions.timeoutMs;

    /**
     * Build the reliability execution options.
     *
     * componentId is always supplied by AIManager because the actual
     * OperationExecutionOptions contract requires it.
     *
     * There is intentionally no operationName because that field does not
     * exist in OperationExecutionOptions.
     */
    const reliabilityExecutionOptions: ReliableExecutionOptions = {
      ...(this.reliabilityOptions.execution ?? {}),
      ...(options.reliability ?? {}),

      componentId: `ai.provider:${provider.name}`,

      timeoutMs,

      recover:
        options.reliability?.recover ?? this.reliabilityOptions.recover ?? true,

      metadata: {
        ...(this.reliabilityOptions.execution?.metadata ?? {}),
        ...(options.reliability?.metadata ?? {}),

        provider: provider.name,

        operation: "ai.generate",

        requestId: request.requestId,
      },

      signal:
        request.signal ??
        options.reliability?.signal ??
        this.reliabilityOptions.execution?.signal,
    };

    const result = await this.reliabilityManager.execute(
      reliabilityExecutionOptions,

      async (operationContext: OperationContext) => {
        /**
         * The operation context belongs to reliability.
         *
         * It is deliberately NOT injected into AIRequest.
         *
         * AIRequest remains the canonical shared application contract.
         */
        void operationContext;

        return provider.generate(request);
      },
    );

    if (result.succeeded && result.value !== undefined) {
      return result.value;
    }

    throw this.toAIError(
      result.error,
      provider.name,
      request,
      result.operation,
    );
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  /**
   * Stream a request through an explicitly selected provider.
   *
   * IMPORTANT:
   *
   * Streaming is deliberately not wrapped in RetryManager here.
   *
   * Once a caller has received non-empty output, retrying the stream could
   * duplicate content and produce an invalid conversation.
   *
   * Stream reliability should therefore be handled as:
   *
   * - connection timeout
   * - cancellation
   * - provider health
   * - circuit state
   * - pre-stream failure handling
   *
   * A dedicated streaming reliability adapter can be introduced later without
   * changing AIProvider.
   */
  public stream(
    providerName: string,
    request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    if (!request) {
      throw new AIError("AI request is required.", "INVALID_REQUEST", {
        retryable: false,
      });
    }

    return this.get(providerName).stream(request);
  }

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  /**
   * Run health checks for every registered provider.
   *
   * A failed health check for one provider does not prevent the remaining
   * providers from being checked.
   *
   * Health checks are intentionally not passed through normal retry execution.
   * The provider itself owns its health probe semantics.
   */
  public async healthCheck(): Promise<
    Awaited<ReturnType<AIProvider["healthCheck"]>>[]
  > {
    const providers = this.list();

    return Promise.all(
      providers.map(async (provider) => {
        try {
          return await provider.healthCheck();
        } catch (error) {
          return {
            provider: provider.name,

            status: "unavailable" as const,

            checkedAt: Date.now(),

            error:
              error instanceof Error ? error.message : "Health check failed.",

            details: {
              runtime: provider.capabilities.local ? "local" : "cloud",

              errorType: error instanceof Error ? error.name : typeof error,
            },
          };
        }
      }),
    );
  }

  // ==========================================================================
  // ERROR NORMALIZATION
  // ==========================================================================

  /**
   * Convert a reliability failure back into the AI error boundary.
   *
   * Reliability remains generic.
   *
   * AIManager is responsible for presenting the final failure in the AI
   * domain's error vocabulary.
   */

  /**
   * Convert a reliability failure back into the AI error boundary.
   *
   * Reliability remains generic.
   *
   * AIManager is responsible for presenting the final failure in the AI
   * domain's error vocabulary.
   */
  private toAIError(
    error: unknown,
    providerName: string,
    request: AIRequest,
    operation: OperationContext,
  ): AIError {
    if (error instanceof AIError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : "AI provider execution failed.";

    /**
     * "UNAVAILABLE" is part of the existing AI error vocabulary.
     *
     * Do not use "EXECUTION" because it is not part of the canonical
     * ErrorCode union.
     *
     * AIErrorDetails intentionally exposes only common AI error metadata
     * at the top level. Reliability-specific diagnostic information such
     * as operationId, componentId, and operationState belongs inside the
     * generic details record.
     */
    return new AIError(message, "UNAVAILABLE", {
      retryable: false,

      details: {
        provider: providerName,

        details: {
          requestId: request.requestId,
          operationId: operation.operationId,
          componentId: operation.componentId,
          operationState: operation.state,
        },
      },
    });
  }
}
