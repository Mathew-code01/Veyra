// ============================================================================
// FILE: core/cloud/contracts/CloudRequest.ts
// PURPOSE:
// Provider-neutral cloud execution request.
//
// This deliberately does NOT import core/ai/AIRequest.
// Cloud must remain usable by AI, audio, vision, documents, etc.
// ============================================================================

export type CloudRequestType =
  | "text_generation"
  | "vision"
  | "speech_to_text"
  | "text_to_speech"
  | "embedding"
  | "document_analysis";

export type CloudMessageRole = "system" | "user" | "assistant" | "tool";

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

export interface CloudMessage {
  readonly role: CloudMessageRole;

  readonly content: string | readonly CloudContentPart[];

  readonly name?: string;
}

export interface CloudToolDefinition {
  readonly name: string;

  readonly description?: string;

  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface CloudGenerationOptions {
  readonly temperature?: number;

  readonly topP?: number;

  readonly maxOutputTokens?: number;

  readonly stopSequences?: readonly string[];

  readonly seed?: number;

  readonly responseFormat?: "text" | "json";

  readonly tools?: readonly CloudToolDefinition[];
}

export interface CloudTextGenerationRequest {
  readonly type: "text_generation";

  readonly model?: string;

  readonly messages: readonly CloudMessage[];

  readonly options?: CloudGenerationOptions;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CloudVisionRequest {
  readonly type: "vision";

  readonly model?: string;

  readonly messages: readonly CloudMessage[];

  readonly options?: CloudGenerationOptions;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

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

export interface CloudEmbeddingRequest {
  readonly type: "embedding";

  readonly model?: string;

  readonly input: string | readonly string[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CloudDocumentAnalysisRequest {
  readonly type: "document_analysis";

  readonly model?: string;

  readonly document: Uint8Array;

  readonly mimeType: string;

  readonly filename?: string;

  readonly prompt?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type CloudRequest =
  | CloudTextGenerationRequest
  | CloudVisionRequest
  | CloudSpeechToTextRequest
  | CloudTextToSpeechRequest
  | CloudEmbeddingRequest
  | CloudDocumentAnalysisRequest;

export interface CloudExecutionOptions {
  readonly signal?: AbortSignal;

  readonly timeoutMs?: number;

  readonly preferredModel?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
