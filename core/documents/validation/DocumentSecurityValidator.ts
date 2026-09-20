// ============================================================================
// FILE: core/documents/validation/DocumentSecurityValidator.ts
// PURPOSE:
// Performs security-oriented validation before a document reaches parsers.
//
// IMPORTANT:
// This class validates document INPUT metadata.
// It is NOT a filesystem sandbox.
//
// Actual file access must be performed by a controlled file-access layer.
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

    if (source.filename !== undefined) {
      const filename = source.filename.trim();

      if (!filename) {
        throw new DocumentError(
          DocumentErrorCode.SECURITY_VALIDATION_FAILED,
          "Document filename cannot be empty.",
        );
      }

      this.validateFilename(filename);
    }

    if (source.path !== undefined) {
      const path = source.path.trim();

      if (!path) {
        throw new DocumentError(
          DocumentErrorCode.SECURITY_VALIDATION_FAILED,
          "Document path cannot be empty.",
        );
      }

      /**
       * The security validator does not authorize arbitrary paths.
       *
       * A dedicated filesystem access layer must enforce allowed roots.
       */
      warnings.push(
        "Filesystem access must be performed through the controlled file-access layer.",
      );
    }

    if (source.data) {
      const size = source.data.byteLength;

      if (size === 0) {
        warnings.push("The supplied document contains zero bytes.");
      }
    }

    if (source.url) {
      try {
        const parsed = new URL(source.url);

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new DocumentError(
            DocumentErrorCode.SECURITY_VALIDATION_FAILED,
            "Only HTTP and HTTPS document URLs are supported.",
            {
              metadata: {
                protocol: parsed.protocol,
              },
            },
          );
        }
      } catch (error) {
        if (error instanceof DocumentError) {
          throw error;
        }

        throw new DocumentError(
          DocumentErrorCode.SECURITY_VALIDATION_FAILED,
          "Document URL is invalid.",
          {
            cause: error,
          },
          {
            cause: error,
          },
        );
      }
    }

    return {
      safe: true,
      warnings,
    };
  }

  private validateFilename(filename: string): void {
    /**
     * Reject control characters.
     */
    for (const character of filename) {
      const code = character.charCodeAt(0);

      if (code < 32 || code === 127) {
        throw new DocumentError(
          DocumentErrorCode.SECURITY_VALIDATION_FAILED,
          "Document filename contains control characters.",
          {
            filename,
          },
        );
      }
    }

    /**
     * Reject obvious traversal patterns.
     */
    const normalized = filename.replace(/\\/g, "/");

    if (
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized.includes("/../") ||
      normalized.endsWith("/..")
    ) {
      throw new DocumentError(
        DocumentErrorCode.SECURITY_VALIDATION_FAILED,
        "Path traversal sequences are not permitted in document filenames.",
        {
          filename,
        },
      );
    }

    /**
     * A filename is not allowed to become an absolute path.
     */
    if (
      normalized.startsWith("/") ||
      /^[A-Za-z]:\//u.test(normalized) ||
      normalized.startsWith("//")
    ) {
      throw new DocumentError(
        DocumentErrorCode.SECURITY_VALIDATION_FAILED,
        "Absolute document paths are not permitted as filenames.",
        {
          filename,
        },
      );
    }
  }
}
