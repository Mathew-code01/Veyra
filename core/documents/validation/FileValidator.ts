// ============================================================================
// FILE: core/documents/validation/FileValidator.ts
// PURPOSE:
// Validates the basic file/source contract before document processing.
// ============================================================================

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import type {
  DocumentProcessingOptions,
  DocumentSource,
} from "../DocumentTypes";

export interface FileValidationResult {
  readonly valid: boolean;

  readonly sizeBytes?: number;

  readonly warnings: readonly string[];
}

export class FileValidator {
  public validate(
    source: DocumentSource,
    options: DocumentProcessingOptions = {},
  ): FileValidationResult {
    if (!source) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document source is required.",
      );
    }

    if (source.type === "file" && !source.path && !source.data) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A file source must provide either a path or raw data.",
      );
    }

    if (source.type === "memory" && !source.data) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A memory document source must provide raw data.",
      );
    }

    if (source.type === "url" && !source.url) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A URL document source must provide a URL.",
      );
    }

    if (source.data && !(source.data instanceof Uint8Array)) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Document data must be a Uint8Array.",
      );
    }

    const sizeBytes = source.data?.byteLength;

    if (
      sizeBytes !== undefined &&
      options.maxFileSizeBytes !== undefined &&
      sizeBytes > options.maxFileSizeBytes
    ) {
      throw new DocumentError(
        DocumentErrorCode.FILE_TOO_LARGE,
        `Document exceeds the configured maximum size of ${options.maxFileSizeBytes} bytes.`,
        {
          filename: source.filename,
        },
      );
    }

    return {
      valid: true,
      sizeBytes,
      warnings: [],
    };
  }
}
