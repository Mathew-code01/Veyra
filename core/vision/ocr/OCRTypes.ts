// ============================================================================
// FILE: core/vision/ocr/OCRTypes.ts
//
// PURPOSE:
// Canonical OCR contracts for Veyra.
//
// OCR answers:
//
//     "What text is visibly present?"
//
// OCR does NOT answer:
//
//     "What should the interview copilot say?"
//
// OCR is therefore an infrastructure capability consumed by VisionAnalyzer.
//
// IMPORTANT:
// width / height are part of OCRRequest because OCR engines may need the
// image coordinate space in order to:
// - produce accurate bounding boxes
// - normalize coordinates
// - preserve reading order
// - map OCR results back to the source image
// ============================================================================

import type { VisionBoundingBox } from "../contracts/VisionTypes";

// ============================================================================
// OCR TEXT BLOCK
// ============================================================================

export interface OCRTextBlock {
  /**
   * Stable OCR block identifier when provided by the OCR engine.
   */
  readonly id?: string;

  /**
   * Text exactly as recognized by the OCR engine.
   */
  readonly text: string;

  /**
   * Recognition confidence in [0, 1].
   */
  readonly confidence?: number;

  /**
   * Position in the source image coordinate system.
   */
  readonly boundingBox?: VisionBoundingBox;

  /**
   * Detected or requested language.
   */
  readonly language?: string;

  /**
   * Reading-order index.
   */
  readonly readingOrder: number;

  /**
   * Provider-specific metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// OCR RESULT
// ============================================================================

export interface OCRResult {
  /**
   * Full recognized text in reading order.
   */
  readonly text: string;

  /**
   * Structured OCR blocks.
   */
  readonly blocks: readonly OCRTextBlock[];

  /**
   * Aggregate confidence in [0, 1].
   */
  readonly confidence?: number;

  /**
   * OCR engine/provider identifier.
   */
  readonly engine?: string;

  /**
   * Primary detected language.
   */
  readonly language?: string;

  /**
   * Total OCR execution duration.
   */
  readonly durationMs?: number;

  /**
   * Provider-specific metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// OCR REQUEST
// ============================================================================

export interface OCRRequest {
  /**
   * Image bytes.
   */
  readonly image: Uint8Array;

  /**
   * Image MIME type.
   */
  readonly mimeType: string;

  /**
   * Width of the image supplied to the OCR engine.
   *
   * This is optional because some callers may not know the decoded image
   * dimensions.
   */
  readonly width?: number;

  /**
   * Height of the image supplied to the OCR engine.
   */
  readonly height?: number;

  /**
   * Requested OCR language.
   */
  readonly language?: string;

  /**
   * Cancellation signal.
   */
  readonly signal?: AbortSignal;

  /**
   * Additional provider/application metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// OCR ADAPTER
// ============================================================================

export interface OCRAdapter {
  recognize(request: OCRRequest): Promise<OCRResult>;
}
