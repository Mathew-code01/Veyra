// ============================================================================
// FILE: core/vision/ocr/OCRService.ts
//
// PURPOSE:
// Production OCR orchestration boundary.
//
// OCRService:
// - validates requests
// - validates image dimensions
// - clones image bytes
// - propagates cancellation
// - validates OCR results
// - normalizes confidence
// - normalizes reading order
// - converts adapter failures into VisionError
//
// The actual OCR engine is injected through OCRAdapter.
//
// OCRService does NOT:
// - decide what an interview answer should be
// - call an AI model
// - route between cloud providers
// - interpret interview intent
// ============================================================================

import { VisionError } from "../errors/VisionError";

import type {
  OCRAdapter,
  OCRRequest,
  OCRResult,
  OCRTextBlock,
} from "./OCRTypes";

// ============================================================================
// OPTIONS
// ============================================================================

export interface OCRServiceOptions {
  readonly adapter: OCRAdapter;

  /**
   * Maximum OCR input payload size.
   */
  readonly maxImageBytes?: number;

  /**
   * MIME types accepted by this OCR boundary.
   */
  readonly supportedMimeTypes?: readonly string[];

  /**
   * Maximum image width accepted by OCR.
   */
  readonly maxWidth?: number;

  /**
   * Maximum image height accepted by OCR.
   */
  readonly maxHeight?: number;
}

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const DEFAULT_MAX_WIDTH = 16_384;

const DEFAULT_MAX_HEIGHT = 16_384;

const DEFAULT_SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

// ============================================================================
// SERVICE
// ============================================================================

export class OCRService {
  private readonly adapter: OCRAdapter;

  private readonly maxImageBytes: number;

  private readonly maxWidth: number;

  private readonly maxHeight: number;

  private readonly supportedMimeTypes: ReadonlySet<string>;

  public constructor(options: OCRServiceOptions) {
    if (!options?.adapter) {
      throw VisionError.invalidRequest("OCRService requires an adapter.");
    }

    this.adapter = options.adapter;

    this.maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;

    this.maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;

    this.maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;

    validatePositiveSafeInteger(this.maxImageBytes, "OCR maxImageBytes");

    validatePositiveSafeInteger(this.maxWidth, "OCR maxWidth");

    validatePositiveSafeInteger(this.maxHeight, "OCR maxHeight");

    const mimeTypes =
      options.supportedMimeTypes ?? DEFAULT_SUPPORTED_MIME_TYPES;

    if (!mimeTypes.length) {
      throw VisionError.invalidRequest(
        "OCR must support at least one MIME type.",
      );
    }

    this.supportedMimeTypes = new Set(mimeTypes.map(normalizeMimeType));
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  public async recognize(request: OCRRequest): Promise<OCRResult> {
    this.validateRequest(request);

    throwIfAborted(request.signal);

    const startedAt = performanceNow();

    const safeRequest: OCRRequest = {
      ...request,

      /*
       * Always provide OCR with independent bytes.
       */
      image: copyToArrayBufferBackedUint8Array(request.image),

      mimeType: normalizeMimeType(request.mimeType),

      width: request.width,

      height: request.height,
    };

    try {
      const result = await this.adapter.recognize(safeRequest);

      throwIfAborted(request.signal);

      return this.normalizeResult(result, startedAt);
    } catch (error) {
      if (request.signal?.aborted) {
        throw VisionError.cancelled({
          stage: "ocr",
          cause: error,
        });
      }

      if (error instanceof VisionError) {
        throw error;
      }

      throw VisionError.fromUnknown(error, "VISION_OCR_FAILED", {
        stage: "ocr",
      });
    }
  }

  // ==========================================================================
  // REQUEST VALIDATION
  // ==========================================================================

  private validateRequest(request: OCRRequest): void {
    if (!request) {
      throw VisionError.invalidRequest("OCR request is required.");
    }

    if (!(request.image instanceof Uint8Array)) {
      throw VisionError.invalidImage("OCR image must be a Uint8Array.", {
        stage: "ocr",
      });
    }

    if (!request.image.byteLength) {
      throw VisionError.invalidImage("OCR image cannot be empty.", {
        stage: "ocr",
      });
    }

    if (request.image.byteLength > this.maxImageBytes) {
      throw VisionError.imageTooLarge(
        request.image.byteLength,
        this.maxImageBytes,
        {
          stage: "ocr",
        },
      );
    }

    const mimeType = normalizeMimeType(request.mimeType);

    if (!mimeType) {
      throw VisionError.invalidImage("OCR image MIME type is required.", {
        stage: "ocr",
      });
    }

    if (!this.supportedMimeTypes.has(mimeType)) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "ocr",
      });
    }

    validateOptionalDimension(request.width, "OCR width", this.maxWidth);

    validateOptionalDimension(request.height, "OCR height", this.maxHeight);

    if (request.language !== undefined && request.language.length > 32) {
      throw VisionError.invalidRequest("OCR language identifier is too long.");
    }
  }

  // ==========================================================================
  // RESULT NORMALIZATION
  // ==========================================================================

  private normalizeResult(result: OCRResult, startedAt: number): OCRResult {
    if (!result) {
      throw new VisionError(
        "VISION_OCR_FAILED",
        "OCR adapter returned no result.",
        {
          details: {
            stage: "ocr",
          },
        },
      );
    }

    if (typeof result.text !== "string") {
      throw new VisionError(
        "VISION_OCR_FAILED",
        "OCR result text must be a string.",
        {
          details: {
            stage: "ocr",
          },
        },
      );
    }

    const blocks = normalizeBlocks(result.blocks);

    const text = result.text.trim();

    const confidence = normalizeConfidence(result.confidence);

    const durationMs =
      Number.isFinite(result.durationMs) &&
      result.durationMs !== undefined &&
      result.durationMs >= 0
        ? result.durationMs
        : performanceNow() - startedAt;

    return Object.freeze({
      text,

      blocks,

      confidence,

      engine: result.engine?.trim() || undefined,

      language: result.language?.trim() || undefined,

      durationMs,

      metadata: Object.freeze({
        ...(result.metadata ?? {}),
      }),
    });
  }
}

// ============================================================================
// BLOCK NORMALIZATION
// ============================================================================

function normalizeBlocks(
  blocks: readonly OCRTextBlock[] | undefined,
): readonly OCRTextBlock[] {
  if (!blocks?.length) {
    return [];
  }

  return Object.freeze(
    blocks
      .filter((block): block is OCRTextBlock =>
        Boolean(block && typeof block.text === "string"),
      )
      .map((block, index) =>
        Object.freeze({
          ...block,

          text: block.text.trim(),

          confidence: normalizeConfidence(block.confidence),

          readingOrder: Number.isSafeInteger(block.readingOrder)
            ? block.readingOrder
            : index,
        }),
      )
      .sort((a, b) => a.readingOrder - b.readingOrder),
  );
}

// ============================================================================
// CONFIDENCE
// ============================================================================

function normalizeConfidence(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

// ============================================================================
// MIME
// ============================================================================

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase();
}

// ============================================================================
// DIMENSIONS
// ============================================================================

function validateOptionalDimension(
  value: number | undefined,
  name: string,
  maximum: number,
): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw VisionError.invalidDimensions(
      `${name} must be a positive safe integer.`,
      {
        stage: "ocr",
      },
    );
  }

  if (value > maximum) {
    throw VisionError.invalidDimensions(`${name} exceeds ${maximum}.`, {
      stage: "ocr",
    });
  }
}

// ============================================================================
// CANCELLATION
// ============================================================================

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw VisionError.cancelled({
      stage: "ocr",
    });
  }
}

// ============================================================================
// BYTE NORMALIZATION
// ============================================================================

function copyToArrayBufferBackedUint8Array(
  data: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(data.byteLength);

  const result = new Uint8Array(buffer);

  result.set(data);

  return result;
}

// ============================================================================
// VALIDATION
// ============================================================================

function validatePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw VisionError.invalidRequest(
      `${name} must be a positive safe integer.`,
    );
  }
}

// ============================================================================
// CLOCK
// ============================================================================

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
