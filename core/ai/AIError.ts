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
// LocalModelProvider, CloudAIProvider, AIRouter, AIExecutionPlan,
// AIExecutionStrategy, and other AI-layer components.
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
   * Diagnostic metadata used by AIManager when a registered provider
   * is not the expected Veyra provider implementation.
   */
  readonly expectedRuntime?: "local" | "cloud";

  /**
   * Optional provider/server-supplied retry delay.
   */
  readonly retryAfterMs?: number;

  /**
   * Original underlying error.
   *
   * Kept in structured diagnostics for application-level inspection.
   */
  readonly cause?: unknown;

  /**
   * Additional structured diagnostic information.
   *
   * Nested execution/routing diagnostics belong here.
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
  public readonly code: AIErrorCode;

  /**
   * Whether the operation may reasonably be retried.
   */
  public readonly retryable: boolean;

  /**
   * Structured diagnostic information.
   */
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
    /**
     * Preserve the native Error.cause property where the runtime supports
     * the standard ErrorOptions constructor.
     *
     * We intentionally avoid relying on it for application diagnostics;
     * `details.cause` remains available as the Veyra-specific representation.
     */
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
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

    /**
     * Required for reliable instanceof AIError behaviour when targeting
     * environments/transpilation modes where Error subclassing needs it.
     */
    Object.setPrototypeOf(this, new.target.prototype);
  }

  // ==========================================================================
  // UNKNOWN ERROR NORMALIZATION
  // ==========================================================================

  /**
   * Normalize arbitrary thrown values into the canonical AIError type.
   */
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
      return new AIError("AI request was aborted.", "ABORTED", {
        retryable: false,
        details,
        cause: error,
      });
    }

    if (error instanceof Error && error.name === "AbortError") {
      return new AIError("AI request was aborted.", "ABORTED", {
        retryable: false,
        details,
        cause: error,
      });
    }

    if (error instanceof Error) {
      return new AIError(
        error.message || "Unknown AI provider error.",
        "UNKNOWN",
        {
          retryable: false,
          details,
          cause: error,
        },
      );
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
          runtime: "local",
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
          runtime: "local",
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
          runtime: "local",
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
          runtime: "local",
        },
      },
    );
  }
}
