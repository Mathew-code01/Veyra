// ============================================================================
// FILE: shared/types/ai.ts
// PURPOSE:
// Canonical shared AI contract used across:
//
// - client
// - desktop
// - server
// - core/ai
//
// IMPORTANT:
//
// This file contains transport/domain contracts only.
//
// It must NOT contain:
// - provider implementations
// - routing logic
// - retry logic
// - model loading
// - cloud transport
// - local runtime logic
//
// core/ai implements these contracts.
// ============================================================================

import type { UUID } from "./common";

// ============================================================================
// PROVIDERS
// ============================================================================

/**
 * Built-in provider identifiers known by the shared application layer.
 *
 * IMPORTANT:
 *
 * This is intentionally NOT the complete provider registry.
 *
 * core/ai supports dynamically registered providers, so arbitrary provider
 * identifiers remain valid at runtime.
 */
export const AI_PROVIDERS = [
  "gemini",
  "ollama",
  "mock",
  "groq",
  "mistral",
  "cerebras",
  "local",
] as const;

export type KnownAIProvider = (typeof AI_PROVIDERS)[number];

/**
 * AI provider identifier.
 *
 * Known providers receive autocomplete through KnownAIProvider while custom
 * provider IDs remain valid for dynamically registered providers.
 */
export type AIProvider = KnownAIProvider | (string & {});

// ============================================================================
// REQUEST MODES
// ============================================================================

export const AI_REQUEST_MODES = [
  "behavioral",
  "technical",
  "coding",
  "system-design",
  "product",
  "case",
  "communication",
  "general",
] as const;

export type AIRequestMode = (typeof AI_REQUEST_MODES)[number];

// ============================================================================
// MESSAGE
// ============================================================================

export type AIMessageRole = "system" | "user" | "assistant";

export interface AIMessage {
  readonly role: AIMessageRole;

  readonly content: string;
}

// ============================================================================
// VISION
// ============================================================================

/**
 * Optional multimodal input.
 *
 * The provider/runtime decides whether the selected model supports vision.
 */
export interface AIVisionInput {
  /**
   * Local image path.
   */
  readonly imagePath?: string;

  /**
   * Base64/data URL representation.
   */
  readonly imageDataUrl?: string;

  /**
   * MIME type when imagePath is supplied.
   */
  readonly imageMimeType?: string;
}

// ============================================================================
// REQUEST OPTIONS
// ============================================================================

export type AIResponseFormat = "text" | "json";

export interface AIRequestOptions {
  readonly temperature?: number;

  readonly maxTokens?: number;

  readonly topP?: number;

  readonly topK?: number;

  readonly stopSequences?: readonly string[];

  readonly responseFormat?: AIResponseFormat;

  /**
   * Metadata must remain serializable across IPC/HTTP boundaries.
   */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

// ============================================================================
// REQUEST
// ============================================================================

/**
 * Canonical AI request.
 *
 * This is intentionally rich enough for both local and cloud execution.
 */
export interface AIRequest {
  /**
   * Stable request identifier.
   */
  readonly requestId: UUID;

  /**
   * Optional explicit provider.
   *
   * Routing may choose a provider when this is omitted.
   */
  readonly provider?: AIProvider;

  /**
   * Optional explicit model ID.
   */
  readonly model?: string;

  /**
   * Optional high-level application mode.
   */
  readonly mode?: AIRequestMode;

  /**
   * Ordered conversation messages.
   */
  readonly messages: readonly AIMessage[];

  /**
   * Generation settings.
   */
  readonly options?: AIRequestOptions;

  /**
   * Optional multimodal input.
   */
  readonly vision?: AIVisionInput;

  /**
   * Caller-owned cancellation signal.
   *
   * This is runtime-only and should not be serialized across IPC/HTTP.
   */
  readonly signal?: AbortSignal;

  /**
   * Optional request timeout.
   */
  readonly timeoutMs?: number;

  /**
   * Convenience top-level generation values.
   *
   * These remain available for transport compatibility.
   */
  readonly temperature?: number;

  readonly maxTokens?: number;

  /**
   * Streaming request.
   */
  readonly stream?: boolean;

  /**
   * Transport-safe metadata.
   */
  readonly metadata?: Readonly<Record<string, string>>;
}

// ============================================================================
// USAGE
// ============================================================================

export interface AIUsage {
  readonly inputTokens?: number;

  readonly outputTokens?: number;

  readonly totalTokens?: number;
}

// ============================================================================
// FINISH REASON
// ============================================================================

export type AIFinishReason =
  "stop" | "length" | "error" | "cancelled" | "unknown";

// ============================================================================
// RESPONSE METADATA
// ============================================================================

export interface AIResponseMetadata {
  /**
   * Provider identifier.
   *
   * Examples:
   *
   * local
   * cloud:gemini
   * cloud:groq
   * cloud:mistral
   */
  readonly provider: string;

  /**
   * Actual model used.
   */
  readonly model: string;

  /**
   * Original request identifier.
   */
  readonly requestId: UUID;

  /**
   * End-to-end latency.
   */
  readonly latencyMs: number;

  /**
   * Provider finish reason.
   */
  readonly finishReason?: AIFinishReason | string;

  /**
   * Token usage.
   */
  readonly usage?: AIUsage;

  /**
   * Whether the response came from a cache.
   */
  readonly cached?: boolean;

  /**
   * Additional provider/runtime diagnostics.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// TEXT RESPONSE
// ============================================================================

export type AITextResponseType =
  "text_generation" | "vision" | "speech_to_text" | "document_analysis";

export interface AITextResponse {
  readonly type: AITextResponseType;

  readonly text: string;

  readonly metadata: AIResponseMetadata;
}

// ============================================================================
// EMBEDDING RESPONSE
// ============================================================================

export interface AIEmbeddingResponse {
  readonly type: "embedding";

  /**
   * One vector per input.
   */
  readonly embeddings: readonly (readonly number[])[];

  /**
   * Number of dimensions in each vector.
   */
  readonly dimensions: number;

  readonly metadata: AIResponseMetadata;
}

// ============================================================================
// RESPONSE UNION
// ============================================================================

export type AIResponse = AITextResponse | AIEmbeddingResponse;

// ============================================================================
// RESPONSE GUARDS
// ============================================================================

export function isAITextResponse(
  response: AIResponse,
): response is AITextResponse {
  return response.type !== "embedding";
}

export function isAIEmbeddingResponse(
  response: AIResponse,
): response is AIEmbeddingResponse {
  return response.type === "embedding";
}

// ============================================================================
// STREAM
// ============================================================================

export interface AIStreamChunk {
  /**
   * Text generated by this chunk.
   */
  readonly text: string;

  /**
   * Original request identifier.
   */
  readonly requestId: UUID;

  /**
   * Provider identifier.
   */
  readonly provider: string;

  /**
   * Actual model used.
   */
  readonly model: string;

  /**
   * Whether this is the final chunk.
   */
  readonly done: boolean;

  /**
   * Finish reason when available.
   */
  readonly finishReason?: AIFinishReason | string;

  /**
   * Optional final usage information.
   */
  readonly usage?: AIUsage;
}

// ============================================================================
// STREAM STATUS
// ============================================================================

export type AIStreamStatus =
  "created" | "starting" | "streaming" | "completed" | "cancelled" | "failed";

export interface AIStreamStart {
  readonly streamId: UUID;

  readonly requestId: UUID;

  readonly provider: string;

  readonly model: string;

  readonly status: AIStreamStatus;

  readonly startedAt: string;
}

// ============================================================================
// HEALTH
// ============================================================================

export type AIHealthState = "healthy" | "degraded" | "unavailable" | "unknown";

export interface AIHealthStatus {
  readonly provider: string;

  readonly state: AIHealthState;

  readonly model?: string;

  readonly runtime?: string;

  readonly checkedAt: string;

  readonly latencyMs?: number;

  readonly errorMessage?: string;

  readonly retryAfterMs?: number;

  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// PROVIDER CAPABILITIES
// ============================================================================

export interface AIProviderCapabilities {
  /**
   * Text generation.
   */
  readonly text: boolean;

  /**
   * Streaming generation.
   */
  readonly streaming: boolean;

  /**
   * Vision/image understanding.
   */
  readonly vision: boolean;

  /**
   * Embeddings.
   */
  readonly embeddings: boolean;

  /**
   * Structured output.
   */
  readonly structuredOutput: boolean;

  /**
   * Tool/function calling.
   */
  readonly toolCalling: boolean;

  /**
   * Local execution.
   */
  readonly local: boolean;
}

// ============================================================================
// PROVIDER STATUS
// ============================================================================

export interface AIProviderStatus {
  readonly provider: string;

  readonly health: AIHealthStatus;

  readonly capabilities: AIProviderCapabilities;

  readonly models: readonly string[];
}

// ============================================================================
// PROVIDER HEALTH
// ============================================================================

/**
 * Execution-layer-compatible health result.
 *
 * This shape intentionally mirrors what core/ai needs while remaining
 * serializable for higher-level consumers.
 */
export interface AIProviderHealth {
  readonly provider: string;

  readonly status: AIHealthState;

  readonly latencyMs?: number;

  readonly checkedAt: number;

  readonly error?: string;

  readonly model?: string;

  readonly runtime?: string;

  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// HELPERS
// ============================================================================

export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Runtime helper for response type detection.
 */
export function isAIResponse(value: unknown): value is AIResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    readonly type?: unknown;
  };

  return (
    candidate.type === "text_generation" ||
    candidate.type === "vision" ||
    candidate.type === "speech_to_text" ||
    candidate.type === "document_analysis" ||
    candidate.type === "embedding"
  );
}
