// ============================================================================
// FILE: core/vision/capture/CaptureEngine.ts
//
// PURPOSE:
// Production capture boundary for the Veyra Vision subsystem.
//
// RESPONSIBILITIES:
// - Validate capture source
// - Validate MIME type
// - Validate byte size
// - Validate dimensions
// - Normalize metadata
// - Clone image bytes
// - Prevent mutable input buffers from leaking into Vision
// - Support cancellation
// - Generate collision-resistant capture IDs
//
// IMPORTANT:
// This class does NOT decode or transform images.
// Image transformation belongs to ImageProcessor.
// ============================================================================

import { VisionError } from "../errors/VisionError";

export type CaptureSourceType =
  "image" | "screenshot" | "clipboard" | "file" | "camera" | "screen";

export interface CaptureInput {
  readonly id?: string;
  readonly source: CaptureSourceType;
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
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
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly allowedMimeTypes?: readonly string[];
  readonly allowedSources?: readonly CaptureSourceType[];
}

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const DEFAULT_ALLOWED_SOURCES: readonly CaptureSourceType[] = [
  "image",
  "screenshot",
  "clipboard",
  "file",
  "camera",
  "screen",
];

export class CaptureEngine {
  private readonly maxBytes: number;
  private readonly maxWidth?: number;
  private readonly maxHeight?: number;

  private readonly allowedMimeTypes: ReadonlySet<string>;
  private readonly allowedSources: ReadonlySet<CaptureSourceType>;

  public constructor(options: CaptureEngineOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    validatePositiveSafeInteger(this.maxBytes, "maxBytes");

    this.maxWidth = options.maxWidth;

    this.maxHeight = options.maxHeight;

    if (this.maxWidth !== undefined) {
      validatePositiveSafeInteger(this.maxWidth, "maxWidth");
    }

    if (this.maxHeight !== undefined) {
      validatePositiveSafeInteger(this.maxHeight, "maxHeight");
    }

    const mimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

    if (!mimeTypes.length) {
      throw VisionError.invalidRequest(
        "At least one image MIME type must be allowed.",
      );
    }

    this.allowedMimeTypes = new Set(mimeTypes.map(normalizeMimeType));

    const sources = options.allowedSources ?? DEFAULT_ALLOWED_SOURCES;

    if (!sources.length) {
      throw VisionError.invalidRequest(
        "At least one capture source must be allowed.",
      );
    }

    this.allowedSources = new Set(sources);
  }

  public capture(input: CaptureInput): CapturedImage {
    this.validate(input);

    throwIfAborted(input.signal, "capture");

    const mimeType = normalizeMimeType(input.mimeType);

    const data = new Uint8Array(input.data);

    const createdAt = input.createdAt ?? Date.now();

    if (!Number.isSafeInteger(createdAt) || createdAt <= 0) {
      throw VisionError.invalidRequest(
        "Capture createdAt must be a positive safe integer.",
        {
          stage: "validation",
        },
      );
    }

    const id = normalizeCaptureId(input.id) ?? createCaptureId();

    return Object.freeze({
      id,
      source: input.source,
      data,
      mimeType,
      width: input.width,
      height: input.height,
      createdAt,
      metadata: normalizeMetadata(input.metadata),
    });
  }

  private validate(input: CaptureInput): void {
    if (!input) {
      throw VisionError.invalidRequest("Capture input is required.");
    }

    if (!this.allowedSources.has(input.source)) {
      throw VisionError.invalidRequest(
        `Unsupported capture source "${String(input.source)}".`,
        {
          stage: "validation",
        },
      );
    }

    if (!(input.data instanceof Uint8Array)) {
      throw VisionError.invalidImage("Capture data must be a Uint8Array.", {
        stage: "validation",
      });
    }

    if (!input.data.byteLength) {
      throw VisionError.invalidImage("Capture contains no image data.", {
        stage: "validation",
      });
    }

    if (input.data.byteLength > this.maxBytes) {
      throw VisionError.imageTooLarge(input.data.byteLength, this.maxBytes, {
        stage: "validation",
      });
    }

    const mimeType = normalizeMimeType(input.mimeType);

    if (!mimeType) {
      throw VisionError.invalidRequest("Capture MIME type is required.");
    }

    if (!this.allowedMimeTypes.has(mimeType)) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "validation",
      });
    }

    validateDimension(input.width, "width", this.maxWidth);

    validateDimension(input.height, "height", this.maxHeight);

    if (input.width !== undefined && input.height !== undefined) {
      const pixels = input.width * input.height;

      if (!Number.isSafeInteger(pixels)) {
        throw VisionError.invalidDimensions(
          "Capture dimensions exceed the supported pixel range.",
          {
            stage: "validation",
            width: input.width,
            height: input.height,
          },
        );
      }
    }
  }
}

function normalizeMimeType(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCaptureId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const id = value.trim();

  if (!id) {
    throw VisionError.invalidRequest("Capture ID cannot be empty.");
  }

  if (id.length > 256) {
    throw VisionError.invalidRequest("Capture ID is too long.");
  }

  return id;
}

function normalizeMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  if (!metadata) {
    return Object.freeze({});
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (!key.trim()) {
      continue;
    }

    result[key] = sanitizeMetadataValue(value);
  }

  return Object.freeze(result);
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(sanitizeMetadataValue);
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = sanitizeMetadataValue(nested);
    }

    return result;
  }

  return String(value);
}

function validateDimension(
  value: number | undefined,
  name: string,
  maximum: number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw VisionError.invalidDimensions(
      `Capture ${name} must be a positive safe integer.`,
      {
        stage: "validation",
      },
    );
  }

  if (maximum !== undefined && value > maximum) {
    throw VisionError.invalidDimensions(
      `Capture ${name} exceeds the maximum allowed value of ${maximum}.`,
      {
        stage: "validation",
        [name === "width" ? "width" : "height"]: value,
        [name === "width" ? "maxWidth" : "maxHeight"]: maximum,
      },
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

function throwIfAborted(
  signal: AbortSignal | undefined,
  stage: "capture",
): void {
  if (signal?.aborted) {
    throw VisionError.cancelled({
      stage,
    });
  }
}

function createCaptureId(): string {
  const timestamp = Date.now().toString(36);

  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Math.random()
          .toString(36)
          .slice(2)}`;

  return `capture-${timestamp}-${uuid}`;
}
