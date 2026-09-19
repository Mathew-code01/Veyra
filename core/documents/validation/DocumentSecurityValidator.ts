// ============================================================================
// FILE: core/documents/validation/DocumentSecurityValidator.ts
// PURPOSE:
// Performs security-oriented validation before a document reaches parsers.
//
// IMPORTANT:
// Parsers must never be trusted simply because the file extension looks safe.
// ============================================================================

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import type { DocumentSource } from "../DocumentTypes";

export interface DocumentSecurityValidationResult {
  readonly safe: boolean;

  readonly warnings: readonly string[];
}

export class DocumentSecurityValidator {
  public validate(source: DocumentSource): DocumentSecurityValidationResult {
    if (!source) {
      throw new DocumentError(
        DocumentErrorCode.SECURITY_VALIDATION_FAILED,
        "Document source is missing.",
      );
    }

    const warnings: string[] = [];

    if (source.filename) {
      const filename = source.filename.trim();

      if (!filename) {
        throw new DocumentError(
          DocumentErrorCode.SECURITY_VALIDATION_FAILED,
          "Document filename cannot be empty.",
        );
      }

      /**
       * Prevent obvious path traversal in filenames.
       *
       * Actual filesystem access must still be performed through
       * a controlled storage/file-access layer.
       */
      if (filename.includes("..\\") || filename.includes("../")) {
        throw new DocumentError(
          DocumentErrorCode.SECURITY_VALIDATION_FAILED,
          "Path traversal sequences are not permitted in document filenames.",
          {
            filename,
          },
        );
      }

      /**
       * Control characters are not useful in normal filenames.
       */
      for (const character of filename) {
        if (character.charCodeAt(0) < 32) {
          throw new DocumentError(
            DocumentErrorCode.SECURITY_VALIDATION_FAILED,
            "Document filename contains control characters.",
            {
              filename,
            },
          );
        }
      }
    }

    if (source.data) {
      const size = source.data.byteLength;

      if (size === 0) {
        warnings.push("The supplied document contains zero bytes.");
      }
    }

    return {
      safe: true,
      warnings,
    };
  }
}
