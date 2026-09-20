// ============================================================================
// FILE: core/documents/extraction/MetadataExtractor.ts
// PURPOSE:
// Produces canonical metadata from a parsed document.
// ============================================================================

import type { ParsedDocument } from "../DocumentTypes";

import {
  createDocumentMetadata,
  type DocumentMetadata,
} from "../DocumentMetadata";

export class MetadataExtractor {
  public extract(document: ParsedDocument): DocumentMetadata {
    const existing = document.metadata ?? {};

    const text = document.text ?? "";

    const metadata = createDocumentMetadata({
      ...existing,

      filename: existing.filename ?? document.identity.filename,

      characterCount: existing.characterCount ?? text.length,

      wordCount: existing.wordCount ?? countWords(text),

      checksum: existing.checksum ?? document.identity.checksum,
    });

    return metadata;
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
