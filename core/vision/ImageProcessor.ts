// core/vision/ImageProcessor.ts

export interface ImageProcessInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ImageProcessOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly quality?: number;
  readonly outputMimeType?: string;
}

export interface ProcessedImage {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly originalBytes: number;
  readonly processedBytes: number;
}

export interface ImageProcessorAdapter {
  process(
    input: ImageProcessInput,
    options: ImageProcessOptions,
  ): Promise<ProcessedImage>;
}

export class ImageProcessor {
  private readonly adapter: ImageProcessorAdapter;

  public constructor(adapter: ImageProcessorAdapter) {
    this.adapter = adapter;
  }

  public async process(
    input: ImageProcessInput,
    options: ImageProcessOptions = {},
  ): Promise<ProcessedImage> {
    if (!input.data.length) {
      throw new Error("Cannot process an empty image.");
    }

    const quality = options.quality ?? 0.85;

    if (quality <= 0 || quality > 1) {
      throw new Error("Image quality must be between 0 and 1.");
    }

    return this.adapter.process(input, {
      ...options,
      quality,
    });
  }
}