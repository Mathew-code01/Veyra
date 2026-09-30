// ============================================================================
// FILE: core/ai/AIError.ts
// PURPOSE:
// Canonical AI-layer error representation.
//
// Error codes come from the shared contract:
//
//   shared/constants/errorCodes.ts
//
// AIError itself remains in core because it contains execution behaviour.
// ============================================================================

import { ERROR_CODES, type ErrorCode } from "../../shared/constants/errorCodes";

// ============================================================================
// RETRY DEFAULTS
// ============================================================================

function defaultErrorRetryable(code: ErrorCode): boolean {
  switch (code) {
    case ERROR_CODES.RATE_LIMITED:
    case ERROR_CODES.QUOTA_EXCEEDED:
    case ERROR_CODES.TIMEOUT:
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.SERVICE_UNAVAILABLE:
    case ERROR_CODES.AI_PROVIDER_UNAVAILABLE:
    case ERROR_CODES.AI_PROVIDER_TIMEOUT:
    case ERROR_CODES.AI_PROVIDER_RATE_LIMITED:
      return true;

    case ERROR_CODES.CANCELLED:
    case ERROR_CODES.ABORTED:
    case ERROR_CODES.INVALID_REQUEST:
    case ERROR_CODES.INVALID_RESPONSE:
    case ERROR_CODES.INVALID_STATE:
    case ERROR_CODES.UNAUTHORIZED:
    case ERROR_CODES.FORBIDDEN:
    case ERROR_CODES.NOT_FOUND:
    case ERROR_CODES.PROVIDER:
    case ERROR_CODES.UNAVAILABLE:
    case ERROR_CODES.UNSUPPORTED:
    case ERROR_CODES.CONFIGURATION:
    case ERROR_CODES.MODEL_NOT_FOUND:
    case ERROR_CODES.MODEL_NOT_INSTALLED:
    case ERROR_CODES.MODEL_UNSUPPORTED:
    case ERROR_CODES.MODEL_NOT_LOADED:
      return false;

    default:
      return false;
  }
}

// ============================================================================
// ERROR CODE
// ============================================================================

/**
 * Backwards-compatible AI-layer alias.
 */
export type AIErrorCode = ErrorCode;

// ============================================================================
// ERROR DETAILS
// ============================================================================

export interface AIErrorDetails {
  /**
   * HTTP/status-like code when available.
   */
  readonly status?: number;

  /**
   * Provider that produced the error.
   */
  readonly provider?: string;

  /**
   * Model involved in the failure.
   */
  readonly model?: string;

  /**
   * Runtime involved in the failure.
   */
  readonly runtime?: string;

  /**
   * Runtime expected by the caller.
   */
  readonly expectedRuntime?: "local" | "cloud";

  /**
   * Provider/server retry delay.
   */
  readonly retryAfterMs?: number;

  /**
   * Original underlying error.
   */
  readonly cause?: unknown;

  /**
   * Additional structured diagnostics.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// AI ERROR
// ============================================================================

export class AIError extends Error {
  public readonly code: AIErrorCode;

  public readonly retryable: boolean;

  public readonly details: AIErrorDetails;

  public constructor(
    message: string,
    code: AIErrorCode,
    options: {
      readonly retryable?: boolean;

      readonly details?: AIErrorDetails;

      readonly cause?: unknown;
    } = {},
  ) {
    super(
      message,
      options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : undefined,
    );

    this.name = "AIError";

    this.code = code;

    this.retryable = options.retryable ?? defaultErrorRetryable(code);

    this.details = Object.freeze({
      ...(options.details ?? {}),

      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }

  // ==========================================================================
  // UNKNOWN ERROR NORMALIZATION
  // ==========================================================================

  public static fromUnknown(error: unknown, details?: AIErrorDetails): AIError {
    if (error instanceof AIError) {
      if (!details) {
        return error;
      }

      return new AIError(error.message, error.code, {
        retryable: error.retryable,

        details: {
          ...error.details,
          ...details,

          details: {
            ...(error.details.details ?? {}),
            ...(details.details ?? {}),
          },
        },

        cause: error.details.cause ?? error.cause,
      });
    }

    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      return new AIError("AI request was aborted.", ERROR_CODES.ABORTED, {
        retryable: false,

        details,

        cause: error,
      });
    }

    if (error instanceof Error && error.name === "AbortError") {
      return new AIError("AI request was aborted.", ERROR_CODES.ABORTED, {
        retryable: false,

        details,

        cause: error,
      });
    }

    if (error instanceof Error) {
      return new AIError(
        error.message || "Unknown AI provider error.",
        ERROR_CODES.UNKNOWN,
        {
          retryable: false,

          details,

          cause: error,
        },
      );
    }

    return new AIError("Unknown AI provider error.", ERROR_CODES.UNKNOWN, {
      retryable: false,

      details,

      cause: error,
    });
  }

  // ==========================================================================
  // LOCAL MODEL ERRORS
  // ==========================================================================

  public static modelNotFound(model: string): AIError {
    return new AIError(
      `Local model "${model}" was not found in the Veyra model registry.`,
      ERROR_CODES.MODEL_NOT_FOUND,
      {
        details: {
          model,
          runtime: "local",
        },
      },
    );
  }

  public static modelNotInstalled(model: string): AIError {
    return new AIError(
      `Local model "${model}" is not installed.`,
      ERROR_CODES.MODEL_NOT_INSTALLED,
      {
        details: {
          model,
          runtime: "local",
        },
      },
    );
  }

  public static modelUnsupported(model: string): AIError {
    return new AIError(
      `Local model "${model}" is not supported by the available Veyra runtimes.`,
      ERROR_CODES.MODEL_UNSUPPORTED,
      {
        details: {
          model,
          runtime: "local",
        },
      },
    );
  }

  public static modelNotLoaded(model: string): AIError {
    return new AIError(
      `Local model "${model}" is not currently loaded.`,
      ERROR_CODES.MODEL_NOT_LOADED,
      {
        details: {
          model,
          runtime: "local",
        },
      },
    );
  }
}
