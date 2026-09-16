// ============================================================================
// FILE: core/cloud/contracts/CloudError.ts
// PURPOSE:
// Canonical cloud-layer error representation.
//
// IMPORTANT:
// CloudError uses the exact same error-code vocabulary as AIError.
//
// There is deliberately no Cloud-only duplicate vocabulary such as:
//
//   RATE_LIMITED
//   BAD_REQUEST
//   SERVER
//
// Those meanings already have canonical Veyra names:
//
//   RATE_LIMIT
//   INVALID_REQUEST
//   UNAVAILABLE
// ============================================================================

import { defaultErrorRetryable, type ErrorCode } from "../../errors/ErrorCode";

// ============================================================================
// ERROR CODE
// ============================================================================

/**
 * Cloud-layer alias for the canonical Veyra error-code vocabulary.
 *
 * CloudError and AIError therefore cannot drift apart at the type level.
 */
export type CloudErrorCode = ErrorCode;

// ============================================================================
// OPTIONS
// ============================================================================

export interface CloudErrorOptions {
  readonly retryable?: boolean;

  readonly providerId?: string;

  readonly statusCode?: number;

  readonly requestId?: string;

  readonly cause?: unknown;

  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// CLOUD ERROR
// ============================================================================

export class CloudError extends Error {
  /**
   * Canonical Veyra error code.
   */
  public readonly code: CloudErrorCode;

  /**
   * Whether retrying the operation is reasonable.
   */
  public readonly retryable: boolean;

  /**
   * Cloud provider identifier.
   */
  public readonly providerId?: string;

  /**
   * HTTP status when the failure originated from an HTTP response.
   */
  public readonly statusCode?: number;

  /**
   * Provider/request correlation identifier.
   */
  public readonly requestId?: string;

  /**
   * Additional structured cloud diagnostics.
   */
  public readonly details?: Readonly<Record<string, unknown>>;

  /**
   * Original error.
   */
  public override readonly cause?: unknown;

  public constructor(
    message: string,
    code: CloudErrorCode = "UNKNOWN",
    options: CloudErrorOptions = {},
  ) {
    super(message);

    this.name = "CloudError";

    this.code = code;

    this.retryable = options.retryable ?? defaultErrorRetryable(code);

    this.providerId = options.providerId;

    this.statusCode = options.statusCode;

    this.requestId = options.requestId;

    this.details = options.details;

    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  // ==========================================================================
  // HTTP RESPONSE -> CLOUD ERROR
  // ==========================================================================

  public static fromHttpResponse(options: {
    readonly status: number;
    readonly statusText: string;
    readonly body?: unknown;
    readonly url?: string;
    readonly durationMs?: number;
  }): CloudError {
    const code = CloudError.mapHttpStatus(options.status);

    const requestId = CloudError.extractRequestId(options.body);

    const providerMessage = CloudError.extractMessage(options.body);

    const message =
      providerMessage ??
      `Cloud provider request failed with HTTP ${options.status} ${options.statusText}.`;

    return new CloudError(message, code, {
      statusCode: options.status,

      requestId,

      /**
       * Preserve the existing transport behaviour:
       *
       * - 408 can be retried.
       * - 409 can be retried when the provider/resource state may change.
       * - 429 can be retried.
       * - 5xx can be retried.
       *
       * Callers can explicitly override this when necessary.
       */
      retryable:
        options.status === 408 ||
        options.status === 409 ||
        options.status === 429 ||
        options.status >= 500,

      details: {
        url: options.url,
        durationMs: options.durationMs,
        response: options.body,
      },
    });
  }

  // ==========================================================================
  // HTTP STATUS NORMALIZATION
  // ==========================================================================

  private static mapHttpStatus(status: number): CloudErrorCode {
    switch (status) {
      // ----------------------------------------------------------------------
      // REQUEST
      // ----------------------------------------------------------------------

      case 400:
      case 422:
        return "INVALID_REQUEST";

      // ----------------------------------------------------------------------
      // AUTHENTICATION / AUTHORIZATION
      // ----------------------------------------------------------------------

      case 401:
        return "AUTHENTICATION";

      case 403:
        return "AUTHORIZATION";

      // ----------------------------------------------------------------------
      // RESOURCE
      // ----------------------------------------------------------------------

      case 404:
        return "NOT_FOUND";

      case 409:
        return "CONFLICT";

      // ----------------------------------------------------------------------
      // TIMEOUT
      // ----------------------------------------------------------------------

      case 408:
      case 504:
        return "TIMEOUT";

      // ----------------------------------------------------------------------
      // RATE LIMIT
      // ----------------------------------------------------------------------

      case 429:
        return "RATE_LIMIT";

      // ----------------------------------------------------------------------
      // UNSUPPORTED
      // ----------------------------------------------------------------------

      case 405:
      case 406:
      case 415:
        return "UNSUPPORTED";

      // ----------------------------------------------------------------------
      // SERVER / AVAILABILITY
      // ----------------------------------------------------------------------

      case 500:
      case 502:
      case 503:
        return "UNAVAILABLE";

      // ----------------------------------------------------------------------
      // FALLBACK
      // ----------------------------------------------------------------------

      default:
        return status >= 500 ? "UNAVAILABLE" : "UNKNOWN";
    }
  }

  // ==========================================================================
  // RESPONSE MESSAGE EXTRACTION
  // ==========================================================================

  private static extractMessage(body: unknown): string | undefined {
    if (!body || typeof body !== "object") {
      return undefined;
    }

    const candidate = body as Record<string, unknown>;

    if (typeof candidate.message === "string") {
      return candidate.message;
    }

    if (candidate.error && typeof candidate.error === "object") {
      const error = candidate.error as Record<string, unknown>;

      if (typeof error.message === "string") {
        return error.message;
      }
    }

    if (typeof candidate.error === "string") {
      return candidate.error;
    }

    return undefined;
  }

  // ==========================================================================
  // REQUEST ID EXTRACTION
  // ==========================================================================

  private static extractRequestId(body: unknown): string | undefined {
    if (!body || typeof body !== "object") {
      return undefined;
    }

    const candidate = body as Record<string, unknown>;

    for (const key of ["request_id", "requestId", "id"]) {
      if (typeof candidate[key] === "string") {
        return candidate[key];
      }
    }

    return undefined;
  }
}
