// core/vision/ImageCompressor.ts

export interface ImageCompressionInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

export interface ImageCompressionOptions {
  readonly maxBytes?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly quality?: number;
}

export interface CompressedImage {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly originalBytes: number;
  readonly compressedBytes: number;
  readonly compressionRatio: number;
}

export interface ImageCompressionAdapter {
  compress(
    input: ImageCompressionInput,
    options: ImageCompressionOptions,
  ): Promise<CompressedImage>;
}

export class ImageCompressor {
  private readonly adapter: ImageCompressionAdapter;

  public constructor(adapter: ImageCompressionAdapter) {
    this.adapter = adapter;
  }

  public async compress(
    input: ImageCompressionInput,
    options: ImageCompressionOptions = {},
  ): Promise<CompressedImage> {
    if (!input.data.length) {
      throw new Error("Cannot compress an empty image.");
    }

    const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;

    if (maxBytes <= 0) {
      throw new Error("Maximum image size must be positive.");
    }

    const result = await this.adapter.compress(input, options);

    if (result.data.byteLength > maxBytes) {
      throw new Error(`Compressed image still exceeds ${maxBytes} bytes.`);
    }

    return result;
  }
}