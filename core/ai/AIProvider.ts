// ============================================================================
// FILE: core/ai/AIProvider.ts
// PURPOSE:
// Core execution provider interface.
//
// Shared AI types are imported from:
//   shared/types/ai.ts
//
// This file owns the execution-facing provider interface because provider
// implementations are a core concern.
// ============================================================================

import type {
  AIProviderCapabilities as SharedAIProviderCapabilities,
  AIProviderHealth as SharedAIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
} from "../../shared/types/ai";

// ============================================================================
// STATUS
// ============================================================================

export type AIProviderStatus =
  "healthy" | "degraded" | "unavailable" | "unknown";

// ============================================================================
// CAPABILITIES
// ============================================================================

/**
 * Core capability contract.
 *
 * It extends the shared capability model while preserving the shape already
 * consumed by LocalModelProvider, CloudAIProvider, AIManager and routing.
 */
export interface AIProviderCapabilities extends SharedAIProviderCapabilities {
  /**
   * Whether the provider supports structured output.
   */
  readonly structuredOutput: boolean;

  /**
   * Whether the provider supports tool/function calling.
   */
  readonly toolCalling: boolean;

  /**
   * Whether the provider executes locally.
   */
  readonly local: boolean;
}

// ============================================================================
// HEALTH
// ============================================================================

export interface AIProviderHealth extends SharedAIProviderHealth {
  readonly status: AIProviderStatus;
}

// ============================================================================
// PROVIDER
// ============================================================================

export interface AIProvider {
  /**
   * Runtime/provider identifier.
   *
   * Examples:
   *
   * local
   * cloud:gemini
   * cloud:groq
   * cloud:mistral
   */
  readonly name: string;

  readonly capabilities: AIProviderCapabilities;

  /**
   * Non-streaming generation.
   */
  generate(request: AIRequest): Promise<AIResponse>;

  /**
   * Streaming generation.
   */
  stream(request: AIRequest): AsyncIterable<AIStreamChunk>;

  /**
   * Provider/runtime health.
   */
  healthCheck(signal?: AbortSignal): Promise<AIProviderHealth>;
}
