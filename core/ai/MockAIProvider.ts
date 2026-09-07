// core/ai/MockAIProvider.ts

import type { AIProvider, AIProviderHealth } from "./AIProvider";
import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";

export interface MockAIProviderOptions {
  response?: string;
  delayMs?: number;
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  readonly capabilities = {
    streaming: true,
    vision: false,
    structuredOutput: true,
    local: true,
  } as const;

  private readonly response: string;
  private readonly delayMs: number;

  constructor(options: MockAIProviderOptions = {}) {
    this.response =
      options.response ?? "This is a mock Interview Copilot response.";

    this.delayMs = options.delayMs ?? 10;
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    return {
      text: this.response,
      metadata: {
        provider: this.name,
        model: "mock",
        requestId: request.requestId,
        latencyMs: this.delayMs,
      },
    };
  }

  async *stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const words = this.response.split(" ");

    for (const word of words) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));

      yield {
        text: `${word} `,
        requestId: request.requestId,
        provider: this.name,
        model: "mock",
        done: false,
      };
    }

    yield {
      text: "",
      requestId: request.requestId,
      provider: this.name,
      model: "mock",
      done: true,
    };
  }

  async healthCheck(_signal?: AbortSignal): Promise<AIProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      latencyMs: 0,
      checkedAt: Date.now(),
    };
  }
}