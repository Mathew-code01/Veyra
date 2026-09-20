// ============================================================================
// FILE: core/documents/extraction/TextExtractor.ts
// PURPOSE:
// Extracts usable text from an already parsed document.
//
// IMPORTANT:
// This is different from the old core/documents/TextExtractor.ts.
//
// The old implementation decoded raw bytes.
// The new extraction layer works with ParsedDocument.
// ============================================================================

import type { ParsedDocument } from "../DocumentTypes";

import { DocumentError, DocumentErrorCode } from "../DocumentError";

export interface ExtractedText {
  readonly text: string;

  readonly characterCount: number;

  readonly wordCount: number;

  readonly warnings: readonly string[];
}

export class TextExtractor {
  public extract(document: ParsedDocument): ExtractedText {
    if (!document) {
      throw new DocumentError(
        DocumentErrorCode.EXTRACTION_FAILED,
        "A parsed document is required for text extraction.",
      );
    }

    const text = document.text?.trim() ?? "";

    if (!text) {
      throw new DocumentError(
        DocumentErrorCode.EXTRACTION_FAILED,
        "The parsed document contains no usable text.",
        {
          documentId: document.identity.id,
        },
      );
    }

    return {
      text,
      characterCount: text.length,
      wordCount: countWords(text),
      warnings: [],
    };
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
