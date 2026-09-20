// ============================================================================
// FILE: core/documents/normalization/DocumentNormalizer.ts
// PURPOSE:
// Converts ParsedDocument into the canonical NormalizedDocument.
//
// PIPELINE:
// ParsedDocument
//      ↓
// TextNormalizer
//      ↓
// structure normalization
//      ↓
// metadata normalization
//      ↓
// NormalizedDocument
//
// This class does not perform persistence, indexing, embedding,
// retrieval, or AI operations.
// ============================================================================

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import type {
  DocumentHeading,
  DocumentParagraph,
  DocumentSection,
  DocumentTable,
  NormalizedDocument,
  ParsedDocument,
} from "../DocumentTypes";

import { createDocumentMetadata } from "../DocumentMetadata";

import {
  TextNormalizer,
  type TextNormalizationOptions,
} from "./TextNormalizer";

export interface DocumentNormalizationOptions extends TextNormalizationOptions {
  readonly normalizeStructure?: boolean;
}

const DEFAULT_OPTIONS: Required<
  Pick<DocumentNormalizationOptions, "normalizeStructure">
> = {
  normalizeStructure: true,
};

export class DocumentNormalizer {
  private readonly textNormalizer: TextNormalizer;

  public constructor(textNormalizer: TextNormalizer = new TextNormalizer()) {
    this.textNormalizer = textNormalizer;
  }

  public normalize(
    document: ParsedDocument,
    options: DocumentNormalizationOptions = {},
  ): NormalizedDocument {
    if (!document) {
      throw new DocumentError(
        DocumentErrorCode.NORMALIZATION_FAILED,
        "A parsed document is required for normalization.",
      );
    }

    const config = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    try {
      const text = this.textNormalizer.normalize(document.text, config);

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.NORMALIZATION_FAILED,
          "Document contains no usable text after normalization.",
          {
            documentId: document.identity.id,
          },
        );
      }

      const paragraphs = config.normalizeStructure
        ? normalizeParagraphs(
            document.paragraphs ?? [],
            this.textNormalizer,
            config,
          )
        : [...(document.paragraphs ?? [])];

      const headings = config.normalizeStructure
        ? normalizeHeadings(
            document.headings ?? [],
            this.textNormalizer,
            config,
          )
        : [...(document.headings ?? [])];

      const sections = config.normalizeStructure
        ? normalizeSections(
            document.sections ?? [],
            this.textNormalizer,
            config,
          )
        : [...(document.sections ?? [])];

      const tables = config.normalizeStructure
        ? normalizeTables(document.tables ?? [], this.textNormalizer, config)
        : [...(document.tables ?? [])];

      const metadata = createDocumentMetadata({
        ...(document.metadata ?? {}),

        filename: document.metadata?.filename ?? document.identity.filename,

        characterCount: text.length,

        wordCount: countWords(text),
      });

      return {
        identity: document.identity,
        type: document.type,
        text,

        paragraphs,

        headings,

        sections,

        tables,

        metadata,

        normalizedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DocumentError) {
        throw error;
      }

      throw DocumentError.from(error, DocumentErrorCode.NORMALIZATION_FAILED, {
        documentId: document.identity.id,
      });
    }
  }
}

function normalizeParagraphs(
  paragraphs: readonly DocumentParagraph[],
  normalizer: TextNormalizer,
  options: DocumentNormalizationOptions,
): DocumentParagraph[] {
  return paragraphs
    .map((paragraph) => ({
      ...paragraph,
      text: normalizer.normalize(paragraph.text, options),
    }))
    .filter((paragraph) => paragraph.text.length > 0);
}

function normalizeHeadings(
  headings: readonly DocumentHeading[],
  normalizer: TextNormalizer,
  options: DocumentNormalizationOptions,
): DocumentHeading[] {
  return headings
    .map((heading) => ({
      ...heading,
      text: normalizer.normalize(heading.text, options),
      level: clampHeadingLevel(heading.level),
    }))
    .filter((heading) => heading.text.length > 0);
}

function normalizeSections(
  sections: readonly DocumentSection[],
  normalizer: TextNormalizer,
  options: DocumentNormalizationOptions,
): DocumentSection[] {
  return sections
    .map((section) => ({
      ...section,

      title: section.title
        ? normalizer.normalize(section.title, options)
        : undefined,

      paragraphs: normalizeParagraphs(section.paragraphs, normalizer, options),

      headings: normalizeHeadings(section.headings, normalizer, options),
    }))
    .filter((section) =>
      Boolean(
        section.title || section.paragraphs.length || section.headings.length,
      ),
    );
}

function normalizeTables(
  tables: readonly DocumentTable[],
  normalizer: TextNormalizer,
  options: DocumentNormalizationOptions,
): DocumentTable[] {
  return tables.map((table) => ({
    ...table,

    headers: table.headers
      ? table.headers.map((header) => normalizer.normalize(header, options))
      : undefined,

    cells: table.cells.map((cell) => ({
      ...cell,
      text: normalizer.normalize(cell.text, options),
    })),
  }));
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.min(6, Math.max(1, Math.trunc(level)));
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
