// ============================================================================
// FILE: core/ai/AIResponse.ts
// PURPOSE:
// Canonical response contract shared by ALL Veyra AI providers.
//
// This contract is intentionally runtime-agnostic.
//
// It is used by:
// - LocalModelProvider
// - CloudAIProvider
// - future remote providers
// - AIManager
// - AI routing/orchestration layers
//
// IMPORTANT:
//
// AIResponse is NOT a cloud-only contract.
//
// A local llama.cpp model and a cloud Mistral/Gemini/Groq model must expose
// compatible responses through the same core/ai abstraction.
//
// RESPONSE TYPES:
//
//                    AIResponse
//                        |
//            ┌───────────┴───────────┐
//            |                       |
//            v                       v
//      AITextResponse        AIEmbeddingResponse
//
// Text responses:
// - text_generation
// - vision
// - speech_to_text
// - document_analysis
//
// Embedding responses:
// - embedding
//
// The `type` discriminator must always be used when consuming AIResponse.
//
// ============================================================================

// ============================================================================
// USAGE
// ============================================================================

export interface AIUsage {
  /**
   * Number of input/prompt tokens consumed.
   */
  readonly inputTokens?: number;

  /**
   * Number of output/completion tokens generated.
   */
  readonly outputTokens?: number;

  /**
   * Total tokens consumed.
   */
  readonly totalTokens?: number;
}

// ============================================================================
// RESPONSE METADATA
// ============================================================================

export interface AIResponseMetadata {
  /**
   * Provider that generated the response.
   *
   * Examples:
   * - local
   * - cloud:gemini
   * - cloud:groq
   * - cloud:mistral
   */
  readonly provider: string;

  /**
   * Actual model ID used.
   */
  readonly model: string;

  /**
   * Original request ID.
   */
  readonly requestId: string;

  /**
   * End-to-end provider latency.
   */
  readonly latencyMs: number;

  /**
   * Provider/runtime finish reason when available.
   */
  readonly finishReason?: string;

  /**
   * Token usage when available.
   */
  readonly usage?: AIUsage;

  /**
   * Whether the response came from a cache.
   */
  readonly cached?: boolean;

  /**
   * Additional provider/runtime information.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// TEXT RESPONSE
// ============================================================================

/**
 * Generic textual AI response.
 *
 * This represents responses where the primary result is text.
 *
 * It intentionally covers several AI tasks because the current core AI
 * abstraction exposes their primary result as text:
 *
 * - text_generation
 * - vision
 * - speech_to_text
 * - document_analysis
 */
export interface AITextResponse {
  /**
   * Discriminator used to safely distinguish this response from embeddings.
   */
  readonly type:
    "text_generation" | "vision" | "speech_to_text" | "document_analysis";

  /**
   * Generated/transcribed/analyzed text.
   */
  readonly text: string;

  /**
   * Standard Veyra response metadata.
   */
  readonly metadata: AIResponseMetadata;
}

// ============================================================================
// EMBEDDING RESPONSE
// ============================================================================

/**
 * Generic embedding response.
 *
 * This is deliberately independent from text responses.
 *
 * Embeddings are numerical vectors and must never be represented as:
 *
 *   text: ""
 *
 * or:
 *
 *   text: JSON.stringify(embeddings)
 *
 * because doing so would destroy the semantic contract of the response.
 */
export interface AIEmbeddingResponse {
  /**
   * Discriminator used to safely distinguish this response from text.
   */
  readonly type: "embedding";

  /**
   * One embedding vector for each input item.
   */
  readonly embeddings: readonly number[][];

  /**
   * Number of dimensions in each embedding vector.
   */
  readonly dimensions: number;

  /**
   * Standard Veyra response metadata.
   */
  readonly metadata: AIResponseMetadata;
}

// ============================================================================
// COMMON RESPONSE UNION
// ============================================================================

/**
 * Canonical response returned by AI providers.
 *
 * This is the common response contract for both:
 *
 * - local AI
 * - cloud AI
 *
 * Consumers should narrow by `response.type`.
 */
export type AIResponse = AITextResponse | AIEmbeddingResponse;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Determine whether an AI response contains generated/transcribed text.
 */
export function isAITextResponse(
  response: AIResponse,
): response is AITextResponse {
  return response.type !== "embedding";
}

/**
 * Determine whether an AI response contains embeddings.
 */
export function isAIEmbeddingResponse(
  response: AIResponse,
): response is AIEmbeddingResponse {
  return response.type === "embedding";
}

// ============================================================================
// STREAM RESPONSE
// ============================================================================

export interface AIStreamChunk {
  /**
   * Text generated by this chunk.
   *
   * Streaming currently applies to textual generation.
   */
  readonly text: string;

  /**
   * Original request ID.
   */
  readonly requestId: string;

  /**
   * Provider that generated the chunk.
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
  readonly finishReason?: string;
}
