// core/ai/AIProvider.ts

import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";

export type AIProviderStatus =
  "healthy" | "degraded" | "unavailable" | "unknown";

export interface AIProviderCapabilities {
  /**
   * Provider can stream generated tokens.
   */
  readonly streaming: boolean;

  /**
   * Provider can process images.
   */
  readonly vision: boolean;

  /**
   * Provider supports structured output.
   */
  readonly structuredOutput: boolean;

  /**
   * Provider executes locally on the user's machine.
   */
  readonly local: boolean;
}

export interface AIProviderHealth {
  readonly provider: string;

  readonly status: AIProviderStatus;

  readonly latencyMs?: number;

  readonly checkedAt: number;

  readonly error?: string;

  /**
   * Currently loaded model, when applicable.
   */
  readonly model?: string;

  /**
   * Runtime name, when applicable.
   */
  readonly runtime?: string;

  /**
   * Additional diagnostics.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface AIProvider {
  readonly name: string;

  readonly capabilities: AIProviderCapabilities;

  generate(request: AIRequest): Promise<AIResponse>;

  stream(request: AIRequest): AsyncIterable<AIStreamChunk>;

  healthCheck(signal?: AbortSignal): Promise<AIProviderHealth>;
}
