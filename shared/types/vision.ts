// shared/types/vision.ts

export type VisionContentType =
  | "code"
  | "document"
  | "diagram"
  | "chart"
  | "screenshot"
  | "job-description"
  | "architecture"
  | "unknown";

export interface VisionAnalysisRequest {
  readonly id: string;

  /**
   * Base64-encoded image payload.
   *
   * The desktop layer is responsible for obtaining the image
   * through an authorized capture flow.
   */
  readonly imageData: string;

  readonly mimeType?: string;

  readonly contentType?: VisionContentType;

  readonly prompt?: string;

  readonly maxImageBytes?: number;
}

export interface OCRResult {
  readonly text: string;
  readonly confidence: number;

  readonly language?: string;
}

export interface VisionAnalysisResult {
  readonly id: string;

  readonly contentType: VisionContentType;

  readonly ocr?: OCRResult;

  readonly analysis: string;

  readonly confidence: number;

  readonly latencyMs: number;

  readonly model?: string;
}