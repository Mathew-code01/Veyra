// ============================================================================
// FILE: core/cloud/contracts/CloudError.ts
// ============================================================================

export type CloudErrorCode =
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "BAD_REQUEST"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK"
  | "SERVER"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED"
  | "CONFIGURATION"
  | "UNKNOWN";

export interface CloudErrorOptions {
  readonly retryable?: boolean;
  readonly providerId?: string;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class CloudError extends Error {
  public readonly code: CloudErrorCode;

  public readonly retryable: boolean;

  public readonly providerId?: string;

  public readonly statusCode?: number;

  public readonly requestId?: string;

  public readonly details?: Readonly<Record<string, unknown>>;

  public override readonly cause?: unknown;

  public constructor(
    message: string,
    code: CloudErrorCode = "UNKNOWN",
    options: CloudErrorOptions = {},
  ) {
    super(message);

    this.name = "CloudError";

    this.code = code;

    this.retryable = options.retryable ?? CloudError.defaultRetryable(code);

    this.providerId = options.providerId;

    this.statusCode = options.statusCode;

    this.requestId = options.requestId;

    this.details = options.details;

    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  private static defaultRetryable(code: CloudErrorCode): boolean {
    switch (code) {
      case "RATE_LIMITED":
      case "QUOTA_EXCEEDED":
      case "TIMEOUT":
      case "NETWORK":
      case "SERVER":
        return true;

      case "AUTHENTICATION":
      case "AUTHORIZATION":
      case "BAD_REQUEST":
      case "NOT_FOUND":
      case "CONFLICT":
      case "ABORTED":
      case "INVALID_RESPONSE":
      case "UNSUPPORTED":
      case "CONFIGURATION":
      case "UNKNOWN":
      default:
        return false;
    }
  }

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

  private static mapHttpStatus(status: number): CloudErrorCode {
    switch (status) {
      case 400:
        return "BAD_REQUEST";

      case 401:
        return "AUTHENTICATION";

      case 403:
        return "AUTHORIZATION";

      case 404:
        return "NOT_FOUND";

      case 409:
        return "CONFLICT";

      case 408:
      case 504:
        return "TIMEOUT";

      case 429:
        return "RATE_LIMITED";

      default:
        return status >= 500 ? "SERVER" : "UNKNOWN";
    }
  }

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
