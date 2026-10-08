
// ============================================================================
// FILE: core/cloud/contracts/CloudRequest.ts
//
// PURPOSE:
// Provider-neutral cloud execution request.
//
// This deliberately does NOT import core/ai/AIRequest.
// Cloud must remain usable by AI, audio, vision, documents, etc.
//
// RELIABILITY:
// Cloud may consume the domain-neutral reliability subsystem through
// CloudExecutionOptions.
//
// IMPORTANT:
// Cloud does not own a separate retry implementation.
// Retry behaviour is supplied as policy and executed by CloudGateway through
// ReliabilityManager.
//
// AI execution should normally leave retryPolicy undefined because
// AIExecutionStrategy already owns AI-level retries and fallback.
// ============================================================================

import type { RecoveryContext } from "../../reliability/recovery/RecoveryManager";

import type { RetryPolicy } from "../../reliability/retry/RetryPolicy";

// ============================================================================
// CLOUD REQUEST TYPES
// ============================================================================

export type CloudRequestType =
  | "text_generation"
  | "vision"
  | "speech_to_text"
  | "text_to_speech"
  | "embedding"
  | "document_analysis";

export type CloudMessageRole = "system" | "user" | "assistant" | "tool";

// ============================================================================
// CONTENT
// ============================================================================

export interface CloudTextPart {
  readonly type: "text";

  readonly text: string;
}

export interface CloudImagePart {
  readonly type: "image";

  readonly source:
    | {
        readonly type: "url";
        readonly url: string;
      }
    | {
        readonly type: "data";
        readonly mediaType: string;
        readonly data: string;
      };
}

export type CloudContentPart = CloudTextPart | CloudImagePart;

// ============================================================================
// MESSAGE
// ============================================================================

export interface CloudMessage {
  readonly role: CloudMessageRole;

  readonly content: string | readonly CloudContentPart[];

  readonly name?: string;
}

// ============================================================================
// TOOLS
// ============================================================================

export interface CloudToolDefinition {
  readonly name: string;

  readonly description?: string;

  readonly parameters?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// GENERATION OPTIONS
// ============================================================================

export interface CloudGenerationOptions {
  readonly temperature?: number;

  readonly topP?: number;

  readonly maxOutputTokens?: number;

  readonly stopSequences?: readonly string[];

  readonly seed?: number;

  readonly responseFormat?: "text" | "json";

  readonly tools?: readonly CloudToolDefinition[];
}

// ============================================================================
// TEXT GENERATION
// ============================================================================

export interface CloudTextGenerationRequest {
  readonly type: "text_generation";

  readonly model?: string;

  readonly messages: readonly CloudMessage[];

  readonly options?: CloudGenerationOptions;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// VISION
// ============================================================================

export interface CloudVisionRequest {
  readonly type: "vision";

  readonly model?: string;

  readonly messages: readonly CloudMessage[];

  readonly options?: CloudGenerationOptions;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// SPEECH TO TEXT
// ============================================================================

export interface CloudSpeechToTextRequest {
  readonly type: "speech_to_text";

  readonly model?: string;

  /**
   * Audio bytes.
   */
  readonly audio: Uint8Array;

  /**
   * MIME type such as audio/wav.
   */
  readonly mimeType: string;

  readonly filename?: string;

  readonly language?: string;

  readonly prompt?: string;

  readonly timestamps?: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// TEXT TO SPEECH
// ============================================================================

export interface CloudTextToSpeechRequest {
  readonly type: "text_to_speech";

  readonly model?: string;

  readonly text: string;

  readonly voice?: string;

  readonly language?: string;

  readonly speed?: number;

  readonly format?: "wav" | "mp3" | "ogg" | "flac" | "mulaw";

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// EMBEDDING
// ============================================================================

export interface CloudEmbeddingRequest {
  readonly type: "embedding";

  readonly model?: string;

  readonly input: string | readonly string[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// DOCUMENT ANALYSIS
// ============================================================================

export interface CloudDocumentAnalysisRequest {
  readonly type: "document_analysis";

  readonly model?: string;

  readonly document: Uint8Array;

  readonly mimeType: string;

  readonly filename?: string;

  readonly prompt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// CLOUD REQUEST
// ============================================================================

export type CloudRequest =
  | CloudTextGenerationRequest
  | CloudVisionRequest
  | CloudSpeechToTextRequest
  | CloudTextToSpeechRequest
  | CloudEmbeddingRequest
  | CloudDocumentAnalysisRequest;

// ============================================================================
// CLOUD RELIABILITY OPTIONS
// ============================================================================

/**
 * Reliability controls supplied to CloudGateway.
 *
 * The values are intentionally optional.
 *
 * When retryPolicy is omitted, CloudGateway performs exactly one reliability
 * attempt. This is important for AI execution because AIExecutionStrategy
 * already owns AI-level retries and fallback.
 */
export interface CloudReliabilityOptions {
  /**
   * Optional cloud-level retry policy.
   *
   * Omit this for AI execution so that AIExecutionStrategy remains the
   * retry owner.
   */
  readonly retryPolicy?: RetryPolicy;

  /**
   * Whether ReliabilityManager should execute recovery actions after
   * the cloud operation fails.
   *
   * Defaults to true at the reliability layer.
   */
  readonly recover?: boolean;

  /**
   * Optional recovery policy/actions.
   *
   * operationId, error and attempt are supplied by ReliabilityManager and
   * therefore cannot be overridden by Cloud callers.
   */
  readonly recovery?: Omit<
    RecoveryContext,
    "operationId" | "error" | "attempt"
  >;
}

// ============================================================================
// CLOUD EXECUTION OPTIONS
// ============================================================================

export interface CloudExecutionOptions {
  /**
   * Abort the cloud operation.
   */
  readonly signal?: AbortSignal;

  /**
   * Maximum execution duration for the reliability boundary.
   *
   * The underlying provider may also receive this value when it supports
   * its own transport-level timeout.
   */
  readonly timeoutMs?: number;

  /**
   * Preferred model selected by the caller.
   */
  readonly preferredModel?: string;

  /**
   * Additional cloud execution metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;

  /**
   * Optional reliability controls.
   *
   * CloudGateway owns the reliability boundary.
   */
  readonly reliability?: CloudReliabilityOptions;
}
