// core/vision/CaptureEngine.ts

export type CaptureSourceType = "image" | "screenshot" | "clipboard" | "file";

export interface CaptureInput {
  readonly id?: string;
  readonly source: CaptureSourceType;
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface CapturedImage {
  readonly id: string;
  readonly source: CaptureSourceType;
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CaptureEngineOptions {
  readonly maxBytes?: number;
  readonly allowedMimeTypes?: readonly string[];
}

export class CaptureEngine {
  private readonly maxBytes: number;
  private readonly allowedMimeTypes: ReadonlySet<string>;

  public constructor(options: CaptureEngineOptions = {}) {
    this.maxBytes = options.maxBytes ?? 15 * 1024 * 1024;

    this.allowedMimeTypes = new Set(
      options.allowedMimeTypes ?? [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ],
    );
  }

  public capture(input: CaptureInput): CapturedImage {
    this.validate(input);

    return {
      id: input.id ?? createCaptureId(),
      source: input.source,
      data: new Uint8Array(input.data),
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      createdAt: input.createdAt ?? Date.now(),
      metadata: {
        ...(input.metadata ?? {}),
      },
    };
  }

  private validate(input: CaptureInput): void {
    if (!input.data?.length) {
      throw new Error("Capture contains no image data.");
    }

    if (input.data.byteLength > this.maxBytes) {
      throw new Error(
        `Capture exceeds maximum size of ${this.maxBytes} bytes.`,
      );
    }

    if (!this.allowedMimeTypes.has(input.mimeType.toLowerCase())) {
      throw new Error(`Unsupported capture MIME type "${input.mimeType}".`);
    }

    if (
      input.width !== undefined &&
      (!Number.isInteger(input.width) || input.width <= 0)
    ) {
      throw new Error("Capture width must be a positive integer.");
    }

    if (
      input.height !== undefined &&
      (!Number.isInteger(input.height) || input.height <= 0)
    ) {
      throw new Error("Capture height must be a positive integer.");
    }
  }
}

function createCaptureId(): string {
  return `capture-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}