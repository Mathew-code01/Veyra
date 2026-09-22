// ============================================================================
// FILE: core/vision/processing/ImageCompressor.ts
//
// PURPOSE:
// Production compression boundary for Vision.
//
// The compressor is intentionally adapter-based. Vision does not know whether
// compression is performed by Sharp, native codecs, Electron, browser APIs,
// or another implementation.
// ============================================================================

import { VisionError } from "../errors/VisionError";

export interface ImageCompressionInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly signal?: AbortSignal;
}

export interface ImageCompressionOptions {
  readonly maxBytes?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly quality?: number;
  readonly outputMimeType?: string;
  readonly signal?: AbortSignal;
}

export interface CompressedImage {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly originalBytes: number;
  readonly compressedBytes: number;
  readonly compressionRatio: number;
  readonly quality?: number;
  readonly durationMs: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ImageCompressionAdapter {
  compress(
    input: ImageCompressionInput,
    options: ImageCompressionOptions,
  ): Promise<CompressedImage>;
}

export interface ImageCompressorOptions {
  readonly adapter: ImageCompressionAdapter;
  readonly defaultMaxBytes?: number;
  readonly maxInputBytes?: number;
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

const DEFAULT_MAX_INPUT_BYTES = 15 * 1024 * 1024;

export class ImageCompressor {
  private readonly adapter: ImageCompressionAdapter;

  private readonly defaultMaxBytes: number;
  private readonly maxInputBytes: number;

  public constructor(options: ImageCompressorOptions) {
    if (!options?.adapter) {
      throw VisionError.invalidRequest("ImageCompressor requires an adapter.");
    }

    this.adapter = options.adapter;

    this.defaultMaxBytes = options.defaultMaxBytes ?? DEFAULT_MAX_BYTES;

    this.maxInputBytes = options.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;

    validatePositiveSafeInteger(this.defaultMaxBytes, "defaultMaxBytes");

    validatePositiveSafeInteger(this.maxInputBytes, "maxInputBytes");
  }

  public async compress(
    input: ImageCompressionInput,
    options: ImageCompressionOptions = {},
  ): Promise<CompressedImage> {
    this.validateInput(input);

    const maxBytes = options.maxBytes ?? this.defaultMaxBytes;

    validatePositiveSafeInteger(maxBytes, "maxBytes");

    if (maxBytes > this.maxInputBytes) {
      throw VisionError.invalidRequest(
        `maxBytes cannot exceed ${this.maxInputBytes}.`,
      );
    }

    const signal = options.signal ?? input.signal;

    throwIfAborted(signal);

    const startedAt = performanceNow();

    try {
      const result = await this.adapter.compress(
        {
          ...input,
          data: new Uint8Array(input.data),
          mimeType: normalizeMimeType(input.mimeType),
        },
        {
          ...options,
          maxBytes,
          signal,
        },
      );

      throwIfAborted(signal);

      return this.validateResult(
        result,
        input.data.byteLength,
        maxBytes,
        startedAt,
      );
    } catch (error) {
      if (signal?.aborted) {
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

  private validateInput(input: ImageCompressionInput): void {
    if (!input) {
      throw VisionError.invalidRequest("Image compression input is required.");
    }

    if (!(input.data instanceof Uint8Array)) {
      throw VisionError.invalidImage(
        "Image compression data must be a Uint8Array.",
      );
    }

    if (!input.data.byteLength) {
      throw VisionError.invalidImage("Cannot compress an empty image.");
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

    if (!mimeType.startsWith("image/")) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "processing",
      });
    }

    validateDimension(input.width, "width");

    validateDimension(input.height, "height");
  }

  private validateResult(
    result: CompressedImage,
    originalBytes: number,
    maxBytes: number,
    startedAt: number,
  ): CompressedImage {
    if (!result) {
      throw new VisionError(
        "VISION_IMAGE_PROCESSING_FAILED",
        "Image compressor returned no result.",
        {
          details: {
            stage: "processing",
          },
        },
      );
    }

    if (!(result.data instanceof Uint8Array) || !result.data.byteLength) {
      throw VisionError.invalidImage(
        "Image compressor returned empty image data.",
      );
    }

    const compressedBytes = result.data.byteLength;

    if (compressedBytes > maxBytes) {
      throw VisionError.imageTooLarge(compressedBytes, maxBytes, {
        stage: "processing",
      });
    }

    const compressionRatio =
      originalBytes === 0 ? 1 : compressedBytes / originalBytes;

    return Object.freeze({
      ...result,
      data: new Uint8Array(result.data),
      mimeType: normalizeMimeType(result.mimeType),
      originalBytes,
      compressedBytes,
      compressionRatio,
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
