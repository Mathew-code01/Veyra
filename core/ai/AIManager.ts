// core/ai/AIManager.ts

import type { AIProvider } from "./AIProvider";
import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";
import { AIError } from "./AIError";

import type { ModelManager } from "../models/ModelManager";
import {
  LocalModelProvider,
  type LocalModelProviderOptions,
} from "./LocalModelProvider";

export interface AIManagerRegisterOptions {
  /**
   * Replace an existing provider with the same name.
   *
   * Defaults to true.
   */
  readonly replaceExisting?: boolean;
}

export class AIManager {
  private readonly providers = new Map<string, AIProvider>();

  // ========================================================================
  // Provider registration
  // ========================================================================

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
      );
    }

    this.providers.set(name, provider);
  }

  public unregister(providerName: string): void {
    this.providers.delete(providerName);
  }

  public has(providerName: string): boolean {
    return this.providers.has(providerName);
  }

  public get(providerName: string): AIProvider {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new AIError(
        `AI provider "${providerName}" is not registered.`,
        "UNAVAILABLE",
      );
    }

    return provider;
  }

  public list(): readonly AIProvider[] {
    return Object.freeze([...this.providers.values()]);
  }

  // ========================================================================
  // Local Veyra model connection
  // ========================================================================

  /**
   * Connect Veyra's local model subsystem
   * to the AI provider layer.
   *
   * This is the official bridge:
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
      );
    }

    return provider;
  }

  // ========================================================================
  // Generation
  // ========================================================================

  public async generate(
    providerName: string,
    request: AIRequest,
  ): Promise<AIResponse> {
    return this.get(providerName).generate(request);
  }

  // ========================================================================
  // Streaming
  // ========================================================================

  public stream(
    providerName: string,
    request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    return this.get(providerName).stream(request);
  }

  // ========================================================================
  // Health
  // ========================================================================

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
          };
        }
      }),
    );
  }
}
