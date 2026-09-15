// ============================================================================
// FILE: core/cloud/contracts/CloudResponse.ts
// ============================================================================

export interface CloudUsage {
  readonly inputTokens?: number;

  readonly outputTokens?: number;

  readonly totalTokens?: number;

  readonly audioSeconds?: number;

  readonly characters?: number;

  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CloudTextResponse {
  readonly type: "text_generation" | "vision";

  readonly providerId: string;

  readonly model: string;

  readonly text: string;

  readonly finishReason?: string;

  readonly usage?: CloudUsage;

  readonly requestId?: string;

  readonly raw?: unknown;
}

export interface CloudSpeechToTextResponse {
  readonly type: "speech_to_text";

  readonly providerId: string;

  readonly model: string;

  readonly text: string;

  readonly language?: string;

  readonly durationSeconds?: number;

  readonly segments?: readonly {
    readonly startSeconds: number;
    readonly endSeconds: number;
    readonly text: string;
  }[];

  readonly usage?: CloudUsage;

  readonly requestId?: string;

  readonly raw?: unknown;
}

export interface CloudTextToSpeechResponse {
  readonly type: "text_to_speech";

  readonly providerId: string;

  readonly model: string;

  readonly audio: Uint8Array;

  readonly mimeType: string;

  readonly requestId?: string;

  readonly raw?: unknown;
}

export interface CloudEmbeddingResponse {
  readonly type: "embedding";

  readonly providerId: string;

  readonly model: string;

  readonly embeddings: readonly number[][];

  readonly dimensions: number;

  readonly usage?: CloudUsage;

  readonly requestId?: string;

  readonly raw?: unknown;
}

export interface CloudDocumentAnalysisResponse {
  readonly type: "document_analysis";

  readonly providerId: string;

  readonly model: string;

  readonly text: string;

  readonly structuredData?: unknown;

  readonly usage?: CloudUsage;

  readonly requestId?: string;

  readonly raw?: unknown;
}

export type CloudResponse =
  | CloudTextResponse
  | CloudSpeechToTextResponse
  | CloudTextToSpeechResponse
  | CloudEmbeddingResponse
  | CloudDocumentAnalysisResponse;
