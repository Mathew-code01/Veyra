// ============================================================================
// FILE: core/ai/AIManager.ts
// PURPOSE:
// Central registry and execution entry point for all Veyra AI providers.
//
// ARCHITECTURE:
//
// AIManager
//    |
//    +--> LocalModelProvider
//    |       |
//    |       +--> ModelManager
//    |
//    +--> CloudAIProvider
//            |
//            +--> CloudGateway
//                    |
//                    +--> CloudProviderRegistry
//                            |
//                            +--> Gemini
//                            +--> Groq
//                            +--> Mistral
//                            +--> Cerebras
//                            +--> ...
//
// IMPORTANT:
//
// AIManager owns provider registration and access.
//
// AIManager does NOT:
// - select interview context
// - build interview prompts
// - rank cloud providers
// - implement retry logic
// - implement circuit breaking
// - implement cloud transport
// - implement local model runtimes
//
// Those responsibilities remain in their respective layers.
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

// ============================================================================
// AI MANAGER
// ============================================================================

export class AIManager {
  /**
   * All providers are stored behind the common AIProvider abstraction.
   */
  private readonly providers = new Map<string, AIProvider>();

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
   */
  public async generate(
    providerName: string,
    request: AIRequest,
  ): Promise<AIResponse> {
    if (!request) {
      throw new AIError("AI request is required.", "INVALID_REQUEST", {
        retryable: false,
      });
    }

    return this.get(providerName).generate(request);
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  /**
   * Stream a request through an explicitly selected provider.
   *
   * Routing belongs to AIRouter.
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
}
