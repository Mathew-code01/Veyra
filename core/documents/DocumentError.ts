// ============================================================================
// FILE: core/documents/DocumentError.ts
// PURPOSE:
// Canonical document-domain error representation.
// ============================================================================

export enum DocumentErrorCode {
  INVALID_INPUT = "DOCUMENT_INVALID_INPUT",
  FILE_NOT_FOUND = "DOCUMENT_FILE_NOT_FOUND",
  FILE_READ_FAILED = "DOCUMENT_FILE_READ_FAILED",
  FILE_TOO_LARGE = "DOCUMENT_FILE_TOO_LARGE",

  UNSUPPORTED_FORMAT = "DOCUMENT_UNSUPPORTED_FORMAT",
  INVALID_MIME_TYPE = "DOCUMENT_INVALID_MIME_TYPE",

  CLASSIFICATION_FAILED = "DOCUMENT_CLASSIFICATION_FAILED",

  PARSE_FAILED = "DOCUMENT_PARSE_FAILED",
  EXTRACTION_FAILED = "DOCUMENT_EXTRACTION_FAILED",

  NORMALIZATION_FAILED = "DOCUMENT_NORMALIZATION_FAILED",

  CHUNKING_FAILED = "DOCUMENT_CHUNKING_FAILED",

  INDEXING_FAILED = "DOCUMENT_INDEXING_FAILED",

  STORAGE_FAILED = "DOCUMENT_STORAGE_FAILED",

  SECURITY_VALIDATION_FAILED = "DOCUMENT_SECURITY_VALIDATION_FAILED",

  ABORTED = "DOCUMENT_PROCESSING_ABORTED",

  INTERNAL_ERROR = "DOCUMENT_INTERNAL_ERROR",
}

export interface DocumentErrorDetails {
  readonly documentId?: string;
  readonly filename?: string;
  readonly path?: string;
  readonly mimeType?: string;
  readonly documentType?: string;
  readonly stage?: string;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Canonical error for the document subsystem.
 */
export class DocumentError extends Error {
  public readonly code: DocumentErrorCode;

  public readonly details: DocumentErrorDetails;

  public readonly retryable: boolean;

  public constructor(
    code: DocumentErrorCode,
    message: string,
    details: DocumentErrorDetails = {},
    options?: {
      readonly cause?: unknown;
      readonly retryable?: boolean;
    },
  ) {
    super(message);

    this.name = "DocumentError";

    this.code = code;

    this.details = {
      ...details,
      cause: options?.cause ?? details.cause,
    };

    this.retryable = options?.retryable ?? false;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static from(
    error: unknown,
    fallbackCode: DocumentErrorCode = DocumentErrorCode.INTERNAL_ERROR,
    details: DocumentErrorDetails = {},
  ): DocumentError {
    if (error instanceof DocumentError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    return new DocumentError(
      fallbackCode,
      message,
      {
        ...details,
        cause: error,
      },
      {
        cause: error,
      },
    );
  }
}
