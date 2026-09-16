// ============================================================================
// FILE: core/ai/AIError.ts
// PURPOSE:
// Canonical AI-layer error representation.
//
// IMPORTANT:
// AIError uses the shared ErrorCode vocabulary from:
//   core/errors/ErrorCode.ts
//
// AIErrorDetails contains structured diagnostic metadata used by AIManager,
// LocalModelProvider, CloudAIProvider, and other AI-layer components.
// ============================================================================

import { defaultErrorRetryable, type ErrorCode } from "../errors/ErrorCode";

// ============================================================================
// ERROR CODE
// ============================================================================

/**
 * Backwards-compatible AI-layer alias.
 *
 * ErrorCode.ts remains the single source of truth.
 */
export type AIErrorCode = ErrorCode;

// ============================================================================
// ERROR DETAILS
// ============================================================================

export interface AIErrorDetails {
  /**
   * HTTP/status-like code when one exists.
   *
   * Local model/runtime errors may not have a status.
   */
  readonly status?: number;

  /**
   * Provider that produced the error.
   *
   * Examples:
   *   gemini
   *   groq
   *   mistral
   *   cloud:gemini
   *   local
   */
  readonly provider?: string;

  /**
   * Model involved in the failure.
   */
  readonly model?: string;

  /**
   * Runtime involved in the failure.
   *
   * Examples:
   *   llama_cpp
   *   cloud
   *   local
   */
  readonly runtime?: string;

  /**
   * Runtime that the caller expected.
   *
   * This is diagnostic metadata used by AIManager when a registered
   * provider is not the expected Veyra provider implementation.
   *
   * Examples:
   *   "local"
   *   "cloud"
   */
  readonly expectedRuntime?: "local" | "cloud";

  /**
   * Optional provider/server-supplied retry delay.
   */
  readonly retryAfterMs?: number;

  /**
   * Original underlying error.
   */
  readonly cause?: unknown;

  /**
   * Additional structured diagnostic information.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// AI ERROR
// ============================================================================

export class AIError extends Error {
  /**
   * Canonical Veyra error code.
   */
  readonly code: AIErrorCode;

  /**
   * Whether the operation may reasonably be retried.
   */
  readonly retryable: boolean;

  /**
   * Structured diagnostic information.
   */
  readonly details: AIErrorDetails;

  public constructor(
    message: string,
    code: AIErrorCode,
    options: {
      readonly retryable?: boolean;
      readonly details?: AIErrorDetails;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message);

    this.name = "AIError";
    this.code = code;

    /**
     * Use the shared canonical retryability rules unless the caller
     * explicitly provides a retryable value.
     */
    this.retryable = options.retryable ?? defaultErrorRetryable(code);

    this.details = {
      ...options.details,
      cause: options.cause ?? options.details?.cause,
    };

    Object.setPrototypeOf(this, new.target.prototype);
  }

  // ==========================================================================
  // UNKNOWN ERROR NORMALIZATION
  // ==========================================================================

  public static fromUnknown(error: unknown, details?: AIErrorDetails): AIError {
    if (error instanceof AIError) {
      return error;
    }

    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      return new AIError("AI request was aborted.", "ABORTED", {
        retryable: false,
        details,
        cause: error,
      });
    }

    if (error instanceof Error) {
      return new AIError(error.message, "UNKNOWN", {
        retryable: false,
        details,
        cause: error,
      });
    }

    return new AIError("Unknown AI provider error.", "UNKNOWN", {
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
      "MODEL_NOT_FOUND",
      {
        details: {
          model,
        },
      },
    );
  }

  public static modelNotInstalled(model: string): AIError {
    return new AIError(
      `Local model "${model}" is not installed.`,
      "MODEL_NOT_INSTALLED",
      {
        details: {
          model,
        },
      },
    );
  }

  public static modelUnsupported(model: string): AIError {
    return new AIError(
      `Local model "${model}" is not supported by the available Veyra runtimes.`,
      "MODEL_UNSUPPORTED",
      {
        details: {
          model,
        },
      },
    );
  }

  public static modelNotLoaded(model: string): AIError {
    return new AIError(
      `Local model "${model}" is not currently loaded.`,
      "MODEL_NOT_LOADED",
      {
        details: {
          model,
        },
      },
    );
  }
}
