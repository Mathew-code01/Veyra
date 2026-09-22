// ============================================================================
// FILE: core/vision/contracts/VisionTypes.ts
// ============================================================================

export type VisionSourceType =
  | "image"
  | "screenshot"
  | "clipboard"
  | "file"
  | "camera"
  | "screen"
  | "unknown";

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

export type VisionDetailLevel = "low" | "medium" | "high";

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

export interface VisionImage {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

export interface VisionSource {
  readonly type: VisionSourceType;
  readonly id?: string;
  readonly createdAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VisionClassification {
  readonly type: VisionContentType;
  readonly confidence: number;
  readonly signals: readonly string[];

  readonly scores?: Readonly<Partial<Record<VisionContentType, number>>>;
}

export interface VisionObservation {
  readonly description: string;
  readonly type: VisionObservationType;
  readonly confidence?: number;
  readonly boundingBox?: VisionBoundingBox;
  readonly text?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionObject {
  readonly label: string;
  readonly confidence?: number;
  readonly boundingBox?: VisionBoundingBox;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionTextBlock {
  readonly text: string;
  readonly confidence?: number;
  readonly boundingBox?: VisionBoundingBox;
  readonly language?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionProviderUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface VisionProviderMetadata {
  readonly providerName: string;
  readonly modelName?: string;

  /**
   * Request identifier supplied by the underlying provider.
   */
  readonly requestId?: string;

  /**
   * Whether the model executed locally or through a cloud service.
   */
  readonly executionTarget?: "local" | "cloud";

  readonly usage?: VisionProviderUsage;

  readonly metadata?: Readonly<Record<string, unknown>>;
}
