// ============================================================================
// FILE: core/documents/classification/DocumentClassifier.ts
// PURPOSE:
// Determines the canonical document type before parsing.
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
        extension: source.filename,
        warnings,
      };
    }

    if (extensionType !== DocumentType.UNKNOWN) {
      return {
        type: extensionType,
        confidence: 0.75,
        source: "extension",
        mimeType,
        extension: source.filename,
        warnings,
      };
    }

    return {
      type: DocumentType.UNKNOWN,
      confidence: 0,
      source: "fallback",
      mimeType,
      extension: source.filename,
      warnings: [
        ...warnings,
        "Unable to determine a supported document format.",
      ],
    };
  }
}
