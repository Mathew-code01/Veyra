// core/ai/AIProvider.ts

import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";

export type AIProviderStatus =
  "healthy" | "degraded" | "unavailable" | "unknown";

export interface AIProviderCapabilities {
  streaming: boolean;
  vision: boolean;
  structuredOutput: boolean;
  local: boolean;
}

export interface AIProviderHealth {
  provider: string;
  status: AIProviderStatus;
  latencyMs?: number;
  checkedAt: number;
  error?: string;
}

export interface AIProvider {
  readonly name: string;
  readonly capabilities: AIProviderCapabilities;

  generate(request: AIRequest): Promise<AIResponse>;

  stream(request: AIRequest): AsyncIterable<AIStreamChunk>;

  healthCheck(signal?: AbortSignal): Promise<AIProviderHealth>;
}