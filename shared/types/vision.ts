// ============================================================================
// FILE: shared/types/vision.ts
//
// PURPOSE:
// Canonical shared Vision contracts.
//
// ARCHITECTURAL ROLE:
//
//     core/vision
//          │
//          ▼
//     shared/types/vision.ts
//          │
//          ▼
//     core/context / AI / Interview
//
// IMPORTANT:
//
// This file is the stable boundary between the Vision subsystem and the rest
// of Veyra.
//
// Vision answers:
//
//     "What is visible?"
//
// It does NOT decide:
//
//     "What should Veyra do with what is visible?"
//
// That responsibility belongs to downstream context, interview, and AI
// orchestration.
//
// RULE:
// This file must not import from core/vision.
// ============================================================================

// ============================================================================
// SOURCE
// ============================================================================

export type VisionSourceType =
  | "image"
  | "screenshot"
  | "clipboard"
  | "file"
  | "camera"
  | "screen"
  | "unknown";

export interface VisionSource {
  readonly type: VisionSourceType;

  /**
   * Identifier of the originating capture/input when available.
   */
  readonly id?: string;

  /**
   * Source creation timestamp in Unix milliseconds.
   */
  readonly createdAt?: number;

  /**
   * Untrusted source metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// IMAGE
// ============================================================================

export interface VisionImage {
  /**
   * Raw encoded image bytes.
   *
   * The Vision runtime may internally clone or transform these bytes.
   */
  readonly data: Uint8Array;

  /**
   * MIME type such as image/png or image/jpeg.
   */
  readonly mimeType: string;

  /**
   * Original image width when known.
   */
  readonly width?: number;

  /**
   * Original image height when known.
   */
  readonly height?: number;
}

// ============================================================================
// DETAIL
// ============================================================================

export type VisionDetailLevel = "low" | "medium" | "high";

// ============================================================================
// CONTENT CLASSIFICATION
// ============================================================================

export type VisionContentType =
  | "code"
  | "document"
  | "diagram"
  | "chart"
  | "table"
  | "screenshot"
  | "webpage"
  | "terminal"
  | "whiteboard"
  | "presentation"
  | "form"
  | "resume"
  | "job_description"
  | "question"
  | "text"
  | "object"
  | "scene"
  | "mixed"
  | "unknown";

export interface VisionClassification {
  readonly type: VisionContentType;

  readonly confidence: number;

  readonly signals: readonly string[];

  readonly scores?: Readonly<Partial<Record<VisionContentType, number>>>;
}

// ============================================================================
// OBSERVATIONS
// ============================================================================

export type VisionObservationType =
  | "text"
  | "object"
  | "ui_element"
  | "diagram"
  | "chart"
  | "table"
  | "code"
  | "document"
  | "person"
  | "scene"
  | "other";

export interface VisionBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VisionObservation {
  readonly description: string;

  readonly type: VisionObservationType;

  readonly confidence?: number;

  readonly boundingBox?: VisionBoundingBox;

  readonly text?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// OBJECTS
// ============================================================================

export interface VisionObject {
  readonly label: string;

  readonly confidence?: number;

  readonly boundingBox?: VisionBoundingBox;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// TEXT BLOCKS
// ============================================================================

export interface VisionTextBlock {
  readonly text: string;

  readonly confidence?: number;

  readonly boundingBox?: VisionBoundingBox;

  readonly language?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// OCR
// ============================================================================

export interface VisionOCRResult {
  readonly text: string;

  readonly confidence: number;

  readonly language?: string;
}

// ============================================================================
// PROVIDER INFORMATION
// ============================================================================

export interface VisionProviderUsage {
  readonly inputTokens?: number;

  readonly outputTokens?: number;

  readonly totalTokens?: number;
}

export interface VisionProviderMetadata {
  /**
   * Logical provider name.
   *
   * Examples:
   *
   *     gemini
   *     ollama
   *     local-vision
   */
  readonly providerName: string;

  /**
   * Model used by the provider.
   */
  readonly modelName?: string;

  /**
   * Provider request identifier.
   */
  readonly requestId?: string;

  /**
   * Whether execution occurred locally or remotely.
   */
  readonly executionTarget?: "local" | "cloud";

  readonly usage?: VisionProviderUsage;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// TIMING
// ============================================================================

export interface VisionTiming {
  readonly totalMs: number;

  readonly preprocessingMs?: number;

  readonly ocrMs?: number;

  readonly classificationMs?: number;

  readonly providerMs?: number;
}

// ============================================================================
// REQUEST
// ============================================================================

export interface VisionAnalysisRequest {
  /**
   * Stable request identifier.
   */
  readonly id: string;

  /**
   * Image being analyzed.
   */
  readonly image: VisionImage;

  /**
   * Origin of the image.
   */
  readonly source?: VisionSource;

  /**
   * Optional question about the visual content.
   */
  readonly question?: string;

  /**
   * Whether OCR should be performed.
   *
   * Vision orchestration defaults this to enabled.
   */
  readonly useOCR?: boolean;

  /**
   * Optional OCR language hint.
   */
  readonly language?: string;

  /**
   * Requested analysis detail.
   */
  readonly detail?: VisionDetailLevel;

  /**
   * Maximum image payload requested by the caller.
   */
  readonly maxImageBytes?: number;

  /**
   * Requested maximum width.
   */
  readonly maxWidth?: number;

  /**
   * Requested maximum height.
   */
  readonly maxHeight?: number;

  /**
   * Logical Vision provider selection.
   */
  readonly providerName?: string;

  /**
   * Provider-specific model selection.
   */
  readonly modelName?: string;

  /**
   * Cancellation signal.
   */
  readonly signal?: AbortSignal;

  /**
   * Untrusted application metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// RESULT SUMMARY
// ============================================================================

export interface VisionAnalysisSummary {
  /**
   * Human-readable description of what Vision determined is visible.
   */
  readonly description: string;

  /**
   * Overall confidence of the summary.
   */
  readonly confidence: number;
}

// ============================================================================
// CANONICAL RESULT
// ============================================================================

export interface VisionAnalysisResult {
  /**
   * Stable identifier for the completed Vision analysis.
   */
  readonly analysisId: string;

  /**
   * Original request identifier.
   *
   * Keeping this on the shared result allows downstream Context to correlate
   * an observation with the request that produced it.
   */
  readonly requestId: string;

  /**
   * High-level summary of visible information.
   */
  readonly summary: VisionAnalysisSummary;

  /**
   * Deterministic visual-content classification.
   */
  readonly classification: VisionClassification;

  /**
   * OCR result when OCR was performed.
   */
  readonly ocr?: VisionOCRResult;

  /**
   * Structured visual observations.
   */
  readonly observations: readonly VisionObservation[];

  /**
   * Detected objects.
   */
  readonly objects: readonly VisionObject[];

  /**
   * Detected text blocks.
   */
  readonly textBlocks: readonly VisionTextBlock[];

  /**
   * Provider information.
   */
  readonly provider?: VisionProviderMetadata;

  /**
   * Pipeline timing information.
   */
  readonly timing: VisionTiming;

  /**
   * Original visual source.
   */
  readonly source?: VisionSource;

  /**
   * Request/provider metadata.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}
