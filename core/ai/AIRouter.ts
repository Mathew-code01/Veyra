// core/ai/AIRouter.ts

import type { AIManager } from "./AIManager";
import type { AIRequest } from "./AIRequest";
import type { AIProvider } from "./AIProvider";
import type { AIResponse } from "./AIResponse";
import { AIError } from "./AIError";

export interface AIRoute {
  providers: string[];
  preferredProvider?: string;
  requireStreaming?: boolean;
  requireVision?: boolean;
  requireLocal?: boolean;
}

export class AIRouter {
  constructor(private readonly manager: AIManager) {}

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

  select(route: AIRoute): AIProvider {
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

  async generate(request: AIRequest, route: AIRoute): Promise<AIResponse> {
    const provider = this.select(route);
    return provider.generate(request);
  }
}