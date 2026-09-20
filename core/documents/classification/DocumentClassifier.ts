// ============================================================================
// FILE: core/documents/classification/DocumentClassifier.ts
// PURPOSE:
// Determines the canonical document type before parsing.
//
// Classification priority:
//   1. MIME type
//   2. filename extension
//   3. UNKNOWN
//
// This class does NOT inspect arbitrary file contents.
// Content sniffing should be introduced separately because it has
// security and parser-specific implications.
// ============================================================================

import { DocumentType, type DocumentSource } from "../DocumentTypes";

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import { MimeTypeResolver } from "./MimeTypeResolver";

import type { DocumentTypeDetectionResult } from "./DocumentType";

export class DocumentClassifier {
  private readonly mimeTypeResolver: MimeTypeResolver;

  public constructor(
    mimeTypeResolver: MimeTypeResolver = new MimeTypeResolver(),
  ) {
    this.mimeTypeResolver = mimeTypeResolver;
  }

  public classify(source: DocumentSource): DocumentTypeDetectionResult {
    if (!source) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A document source is required.",
      );
    }

    const warnings: string[] = [];

    const mimeType = source.mimeType?.trim().toLowerCase();

    const extension = extractExtension(source.filename);

    const extensionType = this.mimeTypeResolver.resolveFromExtension(
      source.filename,
    );

    const mimeTypeResult = this.mimeTypeResolver.resolveFromMimeType(mimeType);

    if (
      mimeTypeResult !== DocumentType.UNKNOWN &&
      extensionType !== DocumentType.UNKNOWN &&
      mimeTypeResult !== extensionType
    ) {
      warnings.push(
        `MIME type indicates "${mimeTypeResult}" while the filename extension indicates "${extensionType}".`,
      );
    }

    if (mimeTypeResult !== DocumentType.UNKNOWN) {
      return {
        type: mimeTypeResult,
        confidence: extensionType === mimeTypeResult ? 1 : 0.9,
        source: "mime",
        mimeType,
        extension,
        warnings,
      };
    }

    if (extensionType !== DocumentType.UNKNOWN) {
      return {
        type: extensionType,
        confidence: 0.75,
        source: "extension",
        mimeType,
        extension,
        warnings,
      };
    }

    return {
      type: DocumentType.UNKNOWN,
      confidence: 0,
      source: "fallback",
      mimeType,
      extension,
      warnings: [
        ...warnings,
        "Unable to determine a supported document format.",
      ],
    };
  }
}

function extractExtension(filename?: string): string | undefined {
  if (!filename) {
    return undefined;
  }

  const normalized = filename.trim();

  if (!normalized) {
    return undefined;
  }

  const lastSeparator = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  const basename =
    lastSeparator >= 0 ? normalized.slice(lastSeparator + 1) : normalized;

  const lastDot = basename.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === basename.length - 1) {
    return undefined;
  }

  return basename.slice(lastDot).toLowerCase();
}
