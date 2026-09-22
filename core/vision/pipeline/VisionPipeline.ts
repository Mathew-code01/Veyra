// ============================================================================
// FILE: core/vision/pipeline/VisionPipeline.ts
//
// PURPOSE:
// Stable application-facing boundary for the Vision subsystem.
//
// Architecture:
//
//     Desktop / IPC / Application
//                 │
//                 ▼
//          VisionPipeline
//                 │
//                 ▼
//          VisionAnalyzer
//                 │
//        ┌────────┼────────┐
//        ▼        ▼        ▼
//      OCR   Processing  Provider
//                 │
//                 ▼
//           VisionResult
//
// IMPORTANT:
// VisionPipeline does NOT reinterpret VisionResult.
//
// VisionAnalyzer already returns the canonical VisionResult contract.
//
// This prevents:
// - duplicate normalization
// - stale legacy fields
// - provider-specific leakage
// - durationMs/timing mismatches
// - unnecessary copying of structured results
// ============================================================================

import type { VisionAnalyzer } from "../analysis/VisionAnalyzer";

import type { VisionRequest } from "../contracts/VisionRequest";

import type { VisionResult } from "../contracts/VisionResult";

import { VisionError } from "../errors/VisionError";

export interface VisionPipelineOptions {
  /**
   * Main Vision orchestration engine.
   */
  readonly analyzer: VisionAnalyzer;

  /**
   * Hard application-level image payload limit.
   *
   * This is an upper safety boundary.
   *
   * request.maxImageBytes may specify a smaller per-request limit.
   */
  readonly maxImageBytes?: number;
}

export class VisionPipeline {
  private readonly analyzer: VisionAnalyzer;

  private readonly maxImageBytes: number;

  public constructor(options: VisionPipelineOptions) {
    if (!options?.analyzer) {
      throw VisionError.invalidRequest(
        "VisionPipeline requires a VisionAnalyzer.",
      );
    }

    const maxImageBytes = options.maxImageBytes ?? 15 * 1024 * 1024;

    if (!Number.isSafeInteger(maxImageBytes) || maxImageBytes <= 0) {
      throw VisionError.invalidRequest(
        "VisionPipeline maxImageBytes must be a positive safe integer.",
      );
    }

    this.analyzer = options.analyzer;

    this.maxImageBytes = maxImageBytes;
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Analyze a visual input.
   *
   * VisionAnalyzer owns:
   * - preprocessing
   * - compression
   * - OCR
   * - classification
   * - provider execution
   * - canonical result construction
   *
   * VisionPipeline owns:
   * - application boundary validation
   * - hard payload limits
   * - cancellation boundary
   * - error normalization
   */
  public async analyze(request: VisionRequest): Promise<VisionResult> {
    this.validateRequest(request);

    throwIfAborted(request.signal);

    try {
      /*
       * IMPORTANT:
       *
       * VisionRequest.image is already the canonical VisionImage object:
       *
       * {
       *     data,
       *     mimeType,
       *     width?,
       *     height?
       * }
       *
       * Do NOT replace it with request.image.data.
       */
      const result = await this.analyzer.analyze(request);

      throwIfAborted(request.signal);

      /*
       * VisionAnalyzer already returns the canonical VisionResult.
       *
       * No normalizeResult() call is necessary.
       */
      return result;
    } catch (error) {
      if (request.signal?.aborted) {
        throw VisionError.cancelled({
          stage: "pipeline",
          cause: error,
        });
      }

      if (error instanceof VisionError) {
        throw error;
      }

      throw VisionError.fromUnknown(error, "VISION_INTERNAL_ERROR", {
        stage: "pipeline",
      });
    }
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  private validateRequest(request: VisionRequest): void {
    if (!request) {
      throw VisionError.invalidRequest("Vision request is required.");
    }

    if (!request.image) {
      throw VisionError.invalidRequest("Vision request image is required.");
    }

    if (!(request.image.data instanceof Uint8Array)) {
      throw VisionError.invalidImage("Vision image data must be a Uint8Array.");
    }

    if (!request.image.data.byteLength) {
      throw VisionError.invalidImage("Vision image contains no data.");
    }

    const mimeType = request.image.mimeType?.trim().toLowerCase();

    if (!mimeType) {
      throw VisionError.invalidImage("Vision image MIME type is required.");
    }

    if (!mimeType.startsWith("image/")) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "validation",
      });
    }

    // ------------------------------------------------------------------------
    // Hard pipeline limit
    // ------------------------------------------------------------------------

    const imageSize = request.image.data.byteLength;

    if (imageSize > this.maxImageBytes) {
      throw VisionError.imageTooLarge(imageSize, this.maxImageBytes, {
        stage: "validation",

        mimeType,
      });
    }

    // ------------------------------------------------------------------------
    // Per-request byte limit
    // ------------------------------------------------------------------------

    if (request.maxImageBytes !== undefined) {
      if (
        !Number.isSafeInteger(request.maxImageBytes) ||
        request.maxImageBytes <= 0
      ) {
        throw VisionError.invalidRequest(
          "maxImageBytes must be a positive safe integer.",
        );
      }

      /*
       * Do not reject here if the image exceeds request.maxImageBytes.
       *
       * VisionAnalyzer may intentionally compress the image to satisfy the
       * requested target size.
       *
       * The pipeline's hard maxImageBytes above is the non-negotiable
       * application boundary.
       */
    }

    // ------------------------------------------------------------------------
    // Width
    // ------------------------------------------------------------------------

    if (request.maxWidth !== undefined) {
      if (!Number.isSafeInteger(request.maxWidth) || request.maxWidth <= 0) {
        throw VisionError.invalidRequest(
          "maxWidth must be a positive safe integer.",
        );
      }
    }

    // ------------------------------------------------------------------------
    // Height
    // ------------------------------------------------------------------------

    if (request.maxHeight !== undefined) {
      if (!Number.isSafeInteger(request.maxHeight) || request.maxHeight <= 0) {
        throw VisionError.invalidRequest(
          "maxHeight must be a positive safe integer.",
        );
      }
    }

    // ------------------------------------------------------------------------
    // Known dimensions
    // ------------------------------------------------------------------------

    if (request.image.width !== undefined) {
      if (
        !Number.isSafeInteger(request.image.width) ||
        request.image.width <= 0
      ) {
        throw VisionError.invalidDimensions(
          "Vision image width must be a positive safe integer.",
          {
            stage: "validation",

            width: request.image.width,
          },
        );
      }
    }

    if (request.image.height !== undefined) {
      if (
        !Number.isSafeInteger(request.image.height) ||
        request.image.height <= 0
      ) {
        throw VisionError.invalidDimensions(
          "Vision image height must be a positive safe integer.",
          {
            stage: "validation",

            height: request.image.height,
          },
        );
      }
    }

    // ------------------------------------------------------------------------
    // Question
    // ------------------------------------------------------------------------

    if (request.question !== undefined && request.question.length > 16_000) {
      throw VisionError.invalidRequest(
        "Vision question exceeds the maximum supported length.",
      );
    }

    // ------------------------------------------------------------------------
    // Language
    // ------------------------------------------------------------------------

    if (request.language !== undefined && request.language.length > 128) {
      throw VisionError.invalidRequest(
        "Vision language exceeds the maximum supported length.",
      );
    }

    // ------------------------------------------------------------------------
    // Provider
    // ------------------------------------------------------------------------

    if (
      request.providerName !== undefined &&
      request.providerName.length > 256
    ) {
      throw VisionError.invalidRequest(
        "Vision provider name exceeds the maximum supported length.",
      );
    }

    // ------------------------------------------------------------------------
    // Model
    // ------------------------------------------------------------------------

    if (request.modelName !== undefined && request.modelName.length > 256) {
      throw VisionError.invalidRequest(
        "Vision model name exceeds the maximum supported length.",
      );
    }
  }
}

// ============================================================================
// CANCELLATION
// ============================================================================

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw VisionError.cancelled({
      stage: "pipeline",
    });
  }
}
