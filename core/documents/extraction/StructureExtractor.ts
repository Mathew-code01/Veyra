// ============================================================================
// FILE: core/documents/extraction/StructureExtractor.ts
// PURPOSE:
// Extracts and validates document structure.
//
// Structure includes:
// - paragraphs
// - headings
// - sections
// ============================================================================

import type {
  DocumentHeading,
  DocumentParagraph,
  DocumentSection,
  ParsedDocument,
} from "../DocumentTypes";

export interface ExtractedStructure {
  readonly paragraphs: readonly DocumentParagraph[];

  readonly headings: readonly DocumentHeading[];

  readonly sections: readonly DocumentSection[];

  readonly warnings: readonly string[];
}

export class StructureExtractor {
  public extract(document: ParsedDocument): ExtractedStructure {
    const paragraphs = document.paragraphs ? [...document.paragraphs] : [];

    const headings = document.headings ? [...document.headings] : [];

    const sections = document.sections ? [...document.sections] : [];

    const warnings: string[] = [];

    if (paragraphs.length === 0 && document.text.trim()) {
      warnings.push(
        "The parser returned document text but no paragraph structure.",
      );
    }

    if (headings.length > 0 && sections.length === 0) {
      warnings.push(
        "Headings were detected but no explicit sections were provided.",
      );
    }

    return {
      paragraphs,
      headings,
      sections,
      warnings,
    };
  }
}
