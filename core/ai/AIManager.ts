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
   *
   * This means AIManager does not need to know whether a provider is:
   *
   * - local
   * - cloud
   * - remote
   * - backed by llama.cpp
   * - backed by Gemini
   * - backed by Groq
   * - etc.
   */
  private readonly providers = new Map<string, AIProvider>();

  // ==========================================================================
  // PROVIDER REGISTRATION
  // ==========================================================================

  /**
   * Register any Veyra AI provider.
   *
   * This is the lowest-level registration method and should remain the
   * canonical registration path for all providers.
   */
  public register(
    provider: AIProvider,
    options: AIManagerRegisterOptions = {},
  ): void {
    const name = provider.name.trim();

    if (!name) {
      throw new AIError("AI provider name cannot be empty.", "INVALID_REQUEST");
    }

    const existing = this.providers.get(name);

    if (existing && options.replaceExisting === false) {
      throw new AIError(
        `AI provider "${name}" is already registered.`,
        "PROVIDER",
        {
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
      throw new AIError("AI provider name cannot be empty.", "INVALID_REQUEST");
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw new AIError(
        `AI provider "${name}" is not registered.`,
        "UNAVAILABLE",
        {
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

  /**
   * Connect Veyra's local model subsystem to the AI provider layer.
   *
   * Architecture:
   *
   * AIManager
   *    ↓
   * LocalModelProvider
   *    ↓
   * ModelManager
   */
  public registerLocalModelProvider(
    modelManager: ModelManager,
    options: LocalModelProviderOptions = {},
  ): LocalModelProvider {
    const provider = new LocalModelProvider(modelManager, options);

    this.register(provider);

    return provider;
  }

  /**
   * Remove the local model provider.
   */
  public unregisterLocalModelProvider(providerName = "local"): void {
    this.unregister(providerName);
  }

  /**
   * Get the local model provider.
   */
  public getLocalModelProvider(providerName = "local"): LocalModelProvider {
    const provider = this.get(providerName);

    if (!(provider instanceof LocalModelProvider)) {
      throw new AIError(
        `Provider "${providerName}" is registered but is not a Veyra LocalModelProvider.`,
        "PROVIDER",
        {
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

  /**
   * Register a CloudAIProvider with AIManager.
   *
   * This is the official cloud bridge:
   *
   * AIManager
   *    ↓
   * CloudAIProvider
   *    ↓
   * CloudGateway
   *    ↓
   * CloudProviderRegistry
   *    ↓
   * Concrete cloud provider
   *
   * AIManager does not communicate directly with Gemini, Groq, Mistral,
   * Cerebras, OpenRouter, etc.
   *
   * CloudAIProvider remains responsible for translating the cloud layer
   * into Veyra's generic AIProvider contract.
   */
  public registerCloudAIProvider(
    options: AIManagerCloudProviderOptions,
  ): CloudAIProvider {
    const { replaceExisting = true, ...providerOptions } = options;

    const provider = new CloudAIProvider(providerOptions);

    this.register(provider, {
      replaceExisting,
    });

    return provider;
  }

  /**
   * Register a CloudAIProvider using an existing CloudProviderRegistry.
   *
   * This is useful when the application bootstrap already owns the registry.
   *
   * Example:
   *
   * const cloudProvider = aiManager.registerCloudAIProviderFromRegistry(
   *   cloudRegistry,
   *   {
   *     providerId: "gemini",
   *   },
   * );
   */
  public registerCloudAIProviderFromRegistry(
    registry: CloudProviderRegistry,
    options: Omit<AIManagerCloudProviderOptions, "registry">,
  ): CloudAIProvider {
    return this.registerCloudAIProvider({
      ...options,
      registry,
    });
  }

  /**
   * Register a CloudAIProvider using an existing CloudGateway.
   *
   * This is the preferred method when the application's cloud subsystem
   * already owns a configured gateway.
   *
   * Example:
   *
   * const cloudProvider = aiManager.registerCloudAIProviderFromGateway(
   *   cloudGateway,
   *   {
   *     providerId: "gemini",
   *   },
   * );
   */
  public registerCloudAIProviderFromGateway(
    gateway: CloudGateway,
    options: Omit<AIManagerCloudProviderOptions, "gateway">,
  ): CloudAIProvider {
    return this.registerCloudAIProvider({
      ...options,
      gateway,
    });
  }

  /**
   * Remove a cloud AI provider.
   *
   * By default this expects the CloudAIProvider naming convention:
   *
   * cloud:<providerId>
   *
   * Example:
   *
   * unregisterCloudAIProvider("cloud:gemini")
   */
  public unregisterCloudAIProvider(providerName: string): void {
    this.unregister(providerName);
  }

  /**
   * Retrieve a registered CloudAIProvider.
   *
   * This protects the rest of the application from accidentally treating
   * another AIProvider implementation as a cloud provider.
   */
  public getCloudAIProvider(providerName: string): CloudAIProvider {
    const provider = this.get(providerName);

    if (!(provider instanceof CloudAIProvider)) {
      throw new AIError(
        `Provider "${providerName}" is registered but is not a Veyra CloudAIProvider.`,
        "PROVIDER",
        {
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
   * Execute a non-streaming request through the selected provider.
   *
   * Provider selection is explicit.
   *
   * AIManager does not decide which provider should be used.
   */
  public async generate(
    providerName: string,
    request: AIRequest,
  ): Promise<AIResponse> {
    return this.get(providerName).generate(request);
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  /**
   * Stream a request through the selected provider.
   *
   * Provider selection remains explicit.
   */
  public stream(
    providerName: string,
    request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    return this.get(providerName).stream(request);
  }

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  /**
   * Run health checks for every registered provider.
   *
   * A failed health check for one provider must not prevent health checks
   * from completing for the remaining providers.
   */
  public async healthCheck(): Promise<
    Awaited<ReturnType<AIProvider["healthCheck"]>>[]
  > {
    return Promise.all(
      this.list().map(async (provider) => {
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
