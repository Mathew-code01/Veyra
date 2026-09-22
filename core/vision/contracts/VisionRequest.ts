// ============================================================================
// FILE: core/vision/contracts/VisionRequest.ts
//
// PURPOSE:
// Canonical request contract for visual analysis.
//
// Vision is designed for general interview assistance. A request may contain
// a coding problem, diagram, chart, resume, browser page, terminal output,
// document, form, presentation, or general visual scene.
// ============================================================================

import type {
  VisionDetailLevel,
  VisionImage,
  VisionSource,
} from "./VisionTypes";

export interface VisionRequest {
  /**
   * Image to analyze.
   */
  readonly image: VisionImage;

  /**
   * Origin of the visual input.
   */
  readonly source?: VisionSource;

  /**
   * Optional natural-language question about the image.
   *
   * Examples:
   *
   * "What is visible here?"
   * "What does this architecture diagram show?"
   * "What is the interviewer asking?"
   * "What information is visible in this job description?"
   */
  readonly question?: string;

  /**
   * Whether OCR should be performed.
   *
   * Defaults to true at the orchestration layer.
   */
  readonly useOCR?: boolean;

  /**
   * Optional OCR language hint.
   */
  readonly language?: string;

  /**
   * Requested visual analysis detail.
   */
  readonly detail?: VisionDetailLevel;

  /**
   * Maximum acceptable image payload.
   */
  readonly maxImageBytes?: number;

  /**
   * Maximum dimensions requested by the caller.
   */
  readonly maxWidth?: number;
  readonly maxHeight?: number;

  /**
   * Optional logical provider selection.
   */
  readonly providerName?: string;

  /**
   * Optional provider-specific model selection.
   *
   * The Vision subsystem should only pass this through to an adapter.
   */
  readonly modelName?: string;

  /**
   * Cancellation signal propagated through the entire operation.
   */
  readonly signal?: AbortSignal;

  /**
   * Optional application metadata.
   *
   * Implementations must treat this as untrusted metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
