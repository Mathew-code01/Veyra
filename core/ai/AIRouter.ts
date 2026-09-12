// core/ai/AIRouter.ts

import type { AIManager } from "./AIManager";
import type { AIRequest } from "./AIRequest";
import type { AIProvider } from "./AIProvider";
import type { AIResponse } from "./AIResponse";
import { AIError } from "./AIError";

export interface AIRoute {
  /**
   * Providers eligible for this request.
   */
  readonly providers: readonly string[];

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
}

export class AIRouter {
  public constructor(private readonly manager: AIManager) {}

  // ========================================================================
  // Capability filtering
  // ========================================================================

  private supports(provider: AIProvider, route: AIRoute): boolean {
    if (route.requireStreaming && !provider.capabilities.streaming) {
      return false;
    }

    if (route.requireVision && !provider.capabilities.vision) {
      return false;
    }

    if (route.requireLocal && !provider.capabilities.local) {
      return false;
    }

    return true;
  }

  // ========================================================================
  // Provider selection
  // ========================================================================

  public select(route: AIRoute): AIProvider {
    const orderedNames = [
      ...(route.preferredProvider ? [route.preferredProvider] : []),

      ...route.providers,
    ];

    const uniqueNames = [...new Set(orderedNames)];

    for (const name of uniqueNames) {
      const provider = this.manager
        .list()
        .find((candidate) => candidate.name === name);

      if (provider && this.supports(provider, route)) {
        return provider;
      }
    }

    throw new AIError(
      "No AI provider satisfies the requested route.",
      "UNAVAILABLE",
    );
  }

  // ========================================================================
  // Generate
  // ========================================================================

  public async generate(
    request: AIRequest,
    route: AIRoute,
  ): Promise<AIResponse> {
    const provider = this.select(route);

    return provider.generate(request);
  }

  // ========================================================================
  // Stream
  // ========================================================================

  public stream(request: AIRequest, route: AIRoute) {
    const provider = this.select(route);

    if (!provider.capabilities.streaming) {
      throw new AIError(
        `Provider "${provider.name}" does not support streaming.`,
        "UNAVAILABLE",
      );
    }

    return provider.stream(request);
  }
}
