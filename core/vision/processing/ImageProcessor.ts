// ============================================================================
// FILE: core/vision/processing/ImageProcessor.ts
//
// PURPOSE:
// Provider-independent image preprocessing boundary.
//
// RESPONSIBILITIES:
// - Validate processing requests
// - Enforce dimensions
// - Enforce output format
// - Enforce quality
// - Propagate cancellation
// - Validate adapter output
// - Preserve processing metrics
//
// ACTUAL IMAGE DECODING / RESIZING / ORIENTATION HANDLING:
// delegated to ImageProcessorAdapter.
//
// This keeps Vision independent of Sharp, Electron, Canvas, native codecs,
// browser APIs, or any other image implementation.
// ============================================================================

import { VisionError } from "../errors/VisionError";

export interface ImageProcessInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly signal?: AbortSignal;
}

export interface ImageProcessOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly quality?: number;
  readonly outputMimeType?: string;
  readonly signal?: AbortSignal;
}

export interface ProcessedImage {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly originalBytes: number;
  readonly processedBytes: number;
  readonly resized: boolean;
  readonly orientationCorrected: boolean;
  readonly durationMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ImageProcessorAdapter {
  process(
    input: ImageProcessInput,
    options: ImageProcessOptions,
  ): Promise<ProcessedImage>;
}

export interface ImageProcessorOptions {
  readonly adapter: ImageProcessorAdapter;
  readonly maxInputBytes?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly allowedOutputMimeTypes?: readonly string[];
}

const DEFAULT_MAX_INPUT_BYTES = 15 * 1024 * 1024;

const DEFAULT_MAX_WIDTH = 8192;

const DEFAULT_MAX_HEIGHT = 8192;

const DEFAULT_OUTPUT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export class ImageProcessor {
  private readonly adapter: ImageProcessorAdapter;

  private readonly maxInputBytes: number;
  private readonly maxWidth: number;
  private readonly maxHeight: number;

  private readonly allowedOutputMimeTypes: ReadonlySet<string>;

  public constructor(options: ImageProcessorOptions) {
    if (!options?.adapter) {
      throw VisionError.invalidRequest("ImageProcessor requires an adapter.");
    }

    this.adapter = options.adapter;

    this.maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;

    this.maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;

    this.maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;

    validatePositiveSafeInteger(this.maxInputBytes, "maxInputBytes");

    validatePositiveSafeInteger(this.maxWidth, "maxWidth");

    validatePositiveSafeInteger(this.maxHeight, "maxHeight");

    const outputMimeTypes =
      options.allowedOutputMimeTypes ?? DEFAULT_OUTPUT_MIME_TYPES;

    if (!outputMimeTypes.length) {
      throw VisionError.invalidRequest(
        "At least one output image MIME type is required.",
      );
    }

    this.allowedOutputMimeTypes = new Set(
      outputMimeTypes.map(normalizeMimeType),
    );
  }

  public async process(
    input: ImageProcessInput,
    options: ImageProcessOptions = {},
  ): Promise<ProcessedImage> {
    this.validateInput(input);

    this.validateOptions(options);

    throwIfAborted(input.signal ?? options.signal);

    const startedAt = performanceNow();

    const safeInput: ImageProcessInput = {
      ...input,
      data: new Uint8Array(input.data),
      mimeType: normalizeMimeType(input.mimeType),
    };

    try {
      const result = await this.adapter.process(safeInput, {
        ...options,
        outputMimeType: options.outputMimeType
          ? normalizeMimeType(options.outputMimeType)
          : undefined,
        signal: options.signal ?? input.signal,
      });

      throwIfAborted(input.signal ?? options.signal);

      return this.validateResult(result, safeInput.data.byteLength, startedAt);
    } catch (error) {
      if ((input.signal ?? options.signal)?.aborted) {
        throw VisionError.cancelled({
          stage: "processing",
          cause: error,
        });
      }

      if (error instanceof VisionError) {
        throw error;
      }

      throw VisionError.fromUnknown(error, "VISION_IMAGE_PROCESSING_FAILED", {
        stage: "processing",
      });
    }
  }

  private validateInput(input: ImageProcessInput): void {
    if (!input) {
      throw VisionError.invalidRequest("Image processing input is required.");
    }

    if (!(input.data instanceof Uint8Array)) {
      throw VisionError.invalidImage(
        "Image processing data must be a Uint8Array.",
      );
    }

    if (!input.data.byteLength) {
      throw VisionError.invalidImage("Cannot process an empty image.");
    }

    if (input.data.byteLength > this.maxInputBytes) {
      throw VisionError.imageTooLarge(
        input.data.byteLength,
        this.maxInputBytes,
        {
          stage: "processing",
        },
      );
    }

    const mimeType = normalizeMimeType(input.mimeType);

    if (!mimeType) {
      throw VisionError.invalidImage("Image MIME type is required.");
    }

    if (!mimeType.startsWith("image/")) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "processing",
      });
    }

    validateDimension(input.width, "width");

    validateDimension(input.height, "height");

    if (input.width !== undefined && input.width > this.maxWidth) {
      throw VisionError.invalidDimensions(
        `Input width exceeds ${this.maxWidth}.`,
        {
          stage: "processing",
          width: input.width,
          maxWidth: this.maxWidth,
        },
      );
    }

    if (input.height !== undefined && input.height > this.maxHeight) {
      throw VisionError.invalidDimensions(
        `Input height exceeds ${this.maxHeight}.`,
        {
          stage: "processing",
          height: input.height,
          maxHeight: this.maxHeight,
        },
      );
    }
  }

  private validateOptions(options: ImageProcessOptions): void {
    if (options.maxWidth !== undefined) {
      validateDimension(options.maxWidth, "maxWidth");

      if (options.maxWidth > this.maxWidth) {
        throw VisionError.invalidDimensions(
          `Requested maxWidth exceeds ${this.maxWidth}.`,
        );
      }
    }

    if (options.maxHeight !== undefined) {
      validateDimension(options.maxHeight, "maxHeight");

      if (options.maxHeight > this.maxHeight) {
        throw VisionError.invalidDimensions(
          `Requested maxHeight exceeds ${this.maxHeight}.`,
        );
      }
    }

    if (
      options.quality !== undefined &&
      (!Number.isFinite(options.quality) ||
        options.quality <= 0 ||
        options.quality > 1)
    ) {
      throw VisionError.invalidRequest(
        "Image quality must be greater than 0 and less than or equal to 1.",
      );
    }

    if (options.outputMimeType !== undefined) {
      const mime = normalizeMimeType(options.outputMimeType);

      if (!this.allowedOutputMimeTypes.has(mime)) {
        throw VisionError.unsupportedMimeType(mime, {
          stage: "processing",
        });
      }
    }
  }

  private validateResult(
    result: ProcessedImage,
    originalBytes: number,
    startedAt: number,
  ): ProcessedImage {
    if (!result) {
      throw new VisionError(
        "VISION_IMAGE_PROCESSING_FAILED",
        "Image processor returned no result.",
        {
          details: {
            stage: "processing",
          },
        },
      );
    }

    if (!(result.data instanceof Uint8Array) || !result.data.byteLength) {
      throw VisionError.invalidImage(
        "Image processor returned empty image data.",
        {
          stage: "processing",
        },
      );
    }

    const mimeType = normalizeMimeType(result.mimeType);

    if (!this.allowedOutputMimeTypes.has(mimeType)) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "processing",
      });
    }

    validateDimension(result.width, "width");

    validateDimension(result.height, "height");

    return Object.freeze({
      ...result,
      data: new Uint8Array(result.data),
      mimeType,
      originalBytes: originalBytes,
      processedBytes: result.data.byteLength,
      durationMs: Number.isFinite(result.durationMs)
        ? result.durationMs
        : performanceNow() - startedAt,
      metadata: Object.freeze({
        ...(result.metadata ?? {}),
      }),
    });
  }
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase();
}

function validateDimension(value: number | undefined, name: string): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw VisionError.invalidDimensions(
      `${name} must be a positive safe integer.`,
    );
  }
}

function validatePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw VisionError.invalidRequest(
      `${name} must be a positive safe integer.`,
    );
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw VisionError.cancelled({
      stage: "processing",
    });
  }
}

function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
