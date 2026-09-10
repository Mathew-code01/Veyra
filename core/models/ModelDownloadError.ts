// core/models/ModelDownloadError.ts

export type ModelDownloadErrorCode =
  | "INVALID_MODEL"
  | "INVALID_ARTIFACT"
  | "NETWORK"
  | "NETWORK_TIMEOUT"
  | "HTTP_RETRY_EXHAUSTED"
  | "HTTP_PERMANENT_FAILURE"
  | "RANGE_UNSUPPORTED"
  | "RANGE_INVALID"
  | "RANGE_NOT_SATISFIABLE"
  | "CONTENT_LENGTH_MISMATCH"
  | "CONTENT_RANGE_MISMATCH"
  | "SIZE_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "DISK_SPACE"
  | "FILE_SYSTEM"
  | "ABORTED";

export interface ModelDownloadErrorOptions {
  readonly code: ModelDownloadErrorCode;

  readonly modelId: string;

  readonly retryable?: boolean;

  readonly cause?: unknown;
}

export class ModelDownloadError extends Error {
  public readonly code: ModelDownloadErrorCode;

  public readonly modelId: string;

  public readonly retryable: boolean;

  public constructor(message: string, options: ModelDownloadErrorOptions) {
    super(message, {
      cause: options.cause,
    });

    this.name = "ModelDownloadError";

    this.code = options.code;

    this.modelId = options.modelId;

    this.retryable = options.retryable ?? false;
  }
}
