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
  | "MODEL_NOT_INSTALLED"
  | "MODEL_UNSUPPORTED"
  | "MODEL_NOT_LOADED"
  | "CONTENT_BLOCKED"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE"
  | "ABORTED"
  | "UNKNOWN";

export interface AIErrorDetails {
  readonly status?: number;

  readonly provider?: string;

  readonly model?: string;

  readonly runtime?: string;

  readonly retryAfterMs?: number;

  readonly cause?: unknown;

  readonly details?: Readonly<Record<string, unknown>>;
}

export class AIError extends Error {
  readonly code: AIErrorCode;

  readonly retryable: boolean;

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

    this.retryable = options.retryable ?? false;

    this.details = {
      ...options.details,
      cause: options.cause ?? options.details?.cause,
    };

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static fromUnknown(error: unknown, details?: AIErrorDetails): AIError {
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
