// ============================================================================
// FILE: core/documents/DocumentError.ts
//
// PURPOSE:
// Canonical document-domain error representation.
//
// ARCHITECTURE:
//
//   parser/library/storage/AI error
//              ↓
//        DocumentService
//              ↓
//        DocumentError
//              ↓
//      document consumers
//
// RULE:
// Infrastructure/parser/library/AI errors should be translated into
// DocumentError before leaving the document subsystem.
//
// IMPORTANT:
// DocumentErrorCode belongs to the document domain.
//
// AIErrorCode remains owned by core/ai.
//
// This prevents the document subsystem from becoming coupled to the internal
// error vocabulary of a specific AI implementation.
// ============================================================================

export enum DocumentErrorCode {
  // --------------------------------------------------------------------------
  // INPUT / VALIDATION
  // --------------------------------------------------------------------------

  INVALID_INPUT = "DOCUMENT_INVALID_INPUT",

  SECURITY_VALIDATION_FAILED = "DOCUMENT_SECURITY_VALIDATION_FAILED",

  INVALID_MIME_TYPE = "DOCUMENT_INVALID_MIME_TYPE",

  // --------------------------------------------------------------------------
  // FILE
  // --------------------------------------------------------------------------

  FILE_NOT_FOUND = "DOCUMENT_FILE_NOT_FOUND",

  FILE_READ_FAILED = "DOCUMENT_FILE_READ_FAILED",

  FILE_TOO_LARGE = "DOCUMENT_FILE_TOO_LARGE",

  // --------------------------------------------------------------------------
  // CLASSIFICATION
  // --------------------------------------------------------------------------

  UNSUPPORTED_FORMAT = "DOCUMENT_UNSUPPORTED_FORMAT",

  CLASSIFICATION_FAILED = "DOCUMENT_CLASSIFICATION_FAILED",

  // --------------------------------------------------------------------------
  // PARSING / EXTRACTION
  // --------------------------------------------------------------------------

  PARSE_FAILED = "DOCUMENT_PARSE_FAILED",

  EXTRACTION_FAILED = "DOCUMENT_EXTRACTION_FAILED",

  // --------------------------------------------------------------------------
  // NORMALIZATION
  // --------------------------------------------------------------------------

  NORMALIZATION_FAILED = "DOCUMENT_NORMALIZATION_FAILED",

  // --------------------------------------------------------------------------
  // CHUNKING
  // --------------------------------------------------------------------------

  CHUNKING_FAILED = "DOCUMENT_CHUNKING_FAILED",

  // --------------------------------------------------------------------------
  // INDEXING
  // --------------------------------------------------------------------------

  INDEXING_FAILED = "DOCUMENT_INDEXING_FAILED",

  // --------------------------------------------------------------------------
  // STORAGE
  // --------------------------------------------------------------------------

  STORAGE_FAILED = "DOCUMENT_STORAGE_FAILED",

  // --------------------------------------------------------------------------
  // AI SEMANTIC ANALYSIS
  // --------------------------------------------------------------------------

  /**
   * The document was successfully processed, but semantic AI analysis
   * failed.
   *
   * This is deliberately a document-domain error.
   *
   * The underlying cause can still be an AIError and is retained in
   * DocumentError.details.cause.
   */
  AI_ANALYSIS_FAILED = "DOCUMENT_AI_ANALYSIS_FAILED",

  // --------------------------------------------------------------------------
  // CANCELLATION
  // --------------------------------------------------------------------------

  ABORTED = "DOCUMENT_PROCESSING_ABORTED",

  // --------------------------------------------------------------------------
  // INTERNAL
  // --------------------------------------------------------------------------

  INTERNAL_ERROR = "DOCUMENT_INTERNAL_ERROR",
}

// ============================================================================
// ERROR DETAILS
// ============================================================================

export interface DocumentErrorDetails {
  /**
   * Stable document identifier.
   */
  readonly documentId?: string;

  /**
   * Original filename.
   */
  readonly filename?: string;

  /**
   * Source path.
   */
  readonly path?: string;

  /**
   * MIME type supplied by the source.
   */
  readonly mimeType?: string;

  /**
   * Logical document format.
   */
  readonly documentType?: string;

  /**
   * Document pipeline stage where the error occurred.
   */
  readonly stage?: string;

  /**
   * Original underlying error.
   *
   * This is intentionally retained internally but is not serialized by
   * toJSON().
   */
  readonly cause?: unknown;

  /**
   * Additional structured diagnostics.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// SERIALIZED ERROR
// ============================================================================

export interface SerializedDocumentError {
  readonly name: string;

  readonly code: DocumentErrorCode;

  readonly message: string;

  readonly details: DocumentErrorDetails;

  readonly retryable: boolean;
}

// ============================================================================
// DOCUMENT ERROR
// ============================================================================

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

  // ==========================================================================
  // UNKNOWN ERROR NORMALIZATION
  // ==========================================================================

  /**
   * Converts an unknown error into a canonical DocumentError.
   *
   * Existing DocumentErrors are returned unchanged so that domain-specific
   * codes are not accidentally replaced.
   */
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

  // ==========================================================================
  // CANCELLATION
  // ==========================================================================

  /**
   * Creates a canonical document cancellation error.
   */
  public static aborted(
    details: DocumentErrorDetails = {},
    cause?: unknown,
  ): DocumentError {
    return new DocumentError(
      DocumentErrorCode.ABORTED,
      "Document processing was aborted.",
      {
        ...details,

        cause,
      },
      {
        cause,

        retryable: false,
      },
    );
  }

  // ==========================================================================
  // TYPE GUARD
  // ==========================================================================

  /**
   * Determines whether an unknown value is a DocumentError.
   */
  public static is(error: unknown): error is DocumentError {
    return error instanceof DocumentError;
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Safe structured representation for logging/IPC/API boundaries.
   *
   * The original cause is deliberately not serialized because it can contain:
   *
   * - circular references
   * - credentials
   * - buffers
   * - provider implementation details
   * - parser-library internals
   */
  public toJSON(): SerializedDocumentError {
    return {
      name: this.name,

      code: this.code,

      message: this.message,

      details: {
        documentId: this.details.documentId,

        filename: this.details.filename,

        path: this.details.path,

        mimeType: this.details.mimeType,

        documentType: this.details.documentType,

        stage: this.details.stage,

        metadata: this.details.metadata,
      },

      retryable: this.retryable,
    };
  }
}
