// ============================================================================
// FILE: core/vision/errors/VisionError.ts
// ============================================================================

export type VisionErrorCode =
  | "VISION_INVALID_REQUEST"
  | "VISION_INVALID_IMAGE"
  | "VISION_UNSUPPORTED_MIME_TYPE"
  | "VISION_IMAGE_TOO_LARGE"
  | "VISION_INVALID_DIMENSIONS"
  | "VISION_IMAGE_PROCESSING_FAILED"
  | "VISION_OCR_FAILED"
  | "VISION_CLASSIFICATION_FAILED"
  | "VISION_PROVIDER_NOT_FOUND"
  | "VISION_PROVIDER_FAILED"
  | "VISION_PROVIDER_UNAVAILABLE"
  | "VISION_CONFIGURATION_ERROR"
  | "VISION_CANCELLED"
  | "VISION_TIMEOUT"
  | "VISION_INTERNAL_ERROR";

export type VisionErrorStage =
  | "capture"
  | "validation"
  | "processing"
  | "ocr"
  | "classification"
  | "provider"
  | "pipeline";

export interface VisionErrorDetails {
  readonly stage?: VisionErrorStage;

  readonly providerName?: string;

  readonly modelName?: string;

  readonly mimeType?: string;

  readonly sizeBytes?: number;

  readonly maxBytes?: number;

  readonly width?: number;

  readonly height?: number;

  readonly maxWidth?: number;

  readonly maxHeight?: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionErrorOptions {
  readonly details?: VisionErrorDetails;
  readonly cause?: unknown;
}

export class VisionError extends Error {
  public readonly code: VisionErrorCode;

  public readonly details: VisionErrorDetails;

  public readonly cause?: unknown;

  public constructor(
    code: VisionErrorCode,
    message: string,
    options: VisionErrorOptions = {},
  ) {
    super(message);

    this.name = "VisionError";

    this.code = code;

    this.details = Object.freeze({
      ...(options.details ?? {}),
    });

    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static invalidRequest(
    message: string,
    details?: VisionErrorDetails,
  ): VisionError {
    return new VisionError("VISION_INVALID_REQUEST", message, {
      details,
    });
  }

  public static invalidImage(
    message: string,
    details?: VisionErrorDetails,
  ): VisionError {
    return new VisionError("VISION_INVALID_IMAGE", message, {
      details,
    });
  }

  public static unsupportedMimeType(
    mimeType: string,
    details?: VisionErrorDetails,
  ): VisionError {
    return new VisionError(
      "VISION_UNSUPPORTED_MIME_TYPE",
      `Unsupported image MIME type "${mimeType}".`,
      {
        details: {
          ...details,
          mimeType,
        },
      },
    );
  }

  public static imageTooLarge(
    sizeBytes: number,
    maxBytes: number,
    details?: VisionErrorDetails,
  ): VisionError {
    return new VisionError(
      "VISION_IMAGE_TOO_LARGE",
      `Image size ${sizeBytes} bytes exceeds the maximum allowed size of ${maxBytes} bytes.`,
      {
        details: {
          ...details,
          sizeBytes,
          maxBytes,
        },
      },
    );
  }

  public static invalidDimensions(
    message: string,
    details?: VisionErrorDetails,
  ): VisionError {
    return new VisionError("VISION_INVALID_DIMENSIONS", message, {
      details,
    });
  }

  public static providerNotFound(
    providerName: string,
    details?: VisionErrorDetails,
  ): VisionError {
    return new VisionError(
      "VISION_PROVIDER_NOT_FOUND",
      `Vision provider "${providerName}" is not registered.`,
      {
        details: {
          ...details,
          providerName,
        },
      },
    );
  }

  public static cancelled(details?: VisionErrorDetails): VisionError {
    return new VisionError(
      "VISION_CANCELLED",
      "Vision analysis was cancelled.",
      {
        details,
      },
    );
  }

  public static fromUnknown(
    error: unknown,
    fallbackCode: VisionErrorCode = "VISION_INTERNAL_ERROR",
    details?: VisionErrorDetails,
  ): VisionError {
    if (error instanceof VisionError) {
      return error;
    }

    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "An unknown Vision error occurred.";

    return new VisionError(fallbackCode, message, {
      details,
      cause: error,
    });
  }
}
