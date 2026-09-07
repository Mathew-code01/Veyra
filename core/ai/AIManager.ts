// core/ai/AIManager.ts

import type { AIProvider } from "./AIProvider";
import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";
import { AIError } from "./AIError";

export class AIManager {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  unregister(providerName: string): void {
    this.providers.delete(providerName);
  }

  get(providerName: string): AIProvider {
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new AIError(
        `AI provider "${providerName}" is not registered.`,
        "UNAVAILABLE",
      );
    }

    return provider;
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  async generate(
    providerName: string,
    request: AIRequest,
  ): Promise<AIResponse> {
    return this.get(providerName).generate(request);
  }

  stream(
    providerName: string,
    request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    return this.get(providerName).stream(request);
  }

  async healthCheck(): Promise<
    Awaited<ReturnType<AIProvider["healthCheck"]>>[]
  > {
    return Promise.all(
      this.list().map((provider) =>
        provider.healthCheck().catch((error) => ({
          provider: provider.name,
          status: "unavailable" as const,
          checkedAt: Date.now(),
          error:
            error instanceof Error ? error.message : "Health check failed.",
        })),
      ),
    );
  }
}