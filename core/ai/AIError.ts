// core/ai/AIError.ts

export type AIErrorCode =
  | "INVALID_REQUEST"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "NETWORK"
  | "PROVIDER"
  | "MODEL_NOT_FOUND"
  | "CONTENT_BLOCKED"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE"
  | "ABORTED"
  | "UNKNOWN";

export interface AIErrorDetails {
  status?: number;
  provider?: string;
  model?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly details: AIErrorDetails;

  constructor(
    message: string,
    code: AIErrorCode,
    options: {
      retryable?: boolean;
      details?: AIErrorDetails;
      cause?: unknown;
    } = {},
  ) {
    super(message);

    this.name = "AIError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = {
      ...options.details,
      cause: options.cause,
    };
  }

  static fromUnknown(error: unknown, details?: AIErrorDetails): AIError {
    if (error instanceof AIError) {
      return error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
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
}