// ============================================================================
// FILE: core/documents/normalization/DocumentNormalizer.ts
// PURPOSE:
// Converts ParsedDocument into the canonical NormalizedDocument.
//
// RESPONSIBILITIES:
// - orchestrate text normalization
// - normalize document structure
// - preserve canonical document structure
// - calculate canonical text statistics
// - honor cancellation
//
// IMPORTANT:
// Cancellation belongs here because this class owns orchestration of
// potentially large document structures.
//
// TextNormalizer and WhitespaceNormalizer remain pure synchronous utilities.
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

  /**
   * Cancels normalization when the owning pipeline/job is aborted.
   */
  readonly signal?: AbortSignal;
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
        {
          stage: "normalization",
        },
      );
    }

    if (!document.identity?.id?.trim()) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Parsed document must have a non-empty identity.",
        {
          stage: "normalization",
        },
      );
    }

    const config = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    try {
      throwIfAborted(config.signal);

      /**
       * Only pass text-specific options into TextNormalizer.
       *
       * Do not pass:
       * - normalizeStructure
       * - signal
       */
      const textOptions: TextNormalizationOptions = {
        unicodeForm: config.unicodeForm,
        normalizeWhitespace: config.normalizeWhitespace,
        removeControlCharacters: config.removeControlCharacters,
      };

      const text = this.textNormalizer.normalize(document.text, textOptions);

      throwIfAborted(config.signal);

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.NORMALIZATION_FAILED,
          "Document contains no usable text after normalization.",
          {
            documentId: document.identity.id,
            stage: "normalization",
          },
        );
      }

      const paragraphs = config.normalizeStructure
        ? normalizeParagraphs(
            document.paragraphs ?? [],
            this.textNormalizer,
            textOptions,
            config.signal,
          )
        : [...(document.paragraphs ?? [])];

      throwIfAborted(config.signal);

      const headings = config.normalizeStructure
        ? normalizeHeadings(
            document.headings ?? [],
            this.textNormalizer,
            textOptions,
            config.signal,
          )
        : [...(document.headings ?? [])];

      throwIfAborted(config.signal);

      const sections = config.normalizeStructure
        ? normalizeSections(
            document.sections ?? [],
            this.textNormalizer,
            textOptions,
            config.signal,
          )
        : [...(document.sections ?? [])];

      throwIfAborted(config.signal);

      const tables = config.normalizeStructure
        ? normalizeTables(
            document.tables ?? [],
            this.textNormalizer,
            textOptions,
            config.signal,
          )
        : [...(document.tables ?? [])];

      throwIfAborted(config.signal);

      const metadata = createDocumentMetadata({
        ...(document.metadata ?? {}),

        filename: document.metadata?.filename ?? document.identity.filename,

        characterCount: text.length,

        wordCount: countWords(text),
      });

      throwIfAborted(config.signal);

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
        stage: "normalization",
      });
    }
  }
}

function normalizeParagraphs(
  paragraphs: readonly DocumentParagraph[],
  normalizer: TextNormalizer,
  options: TextNormalizationOptions,
  signal?: AbortSignal,
): DocumentParagraph[] {
  const result: DocumentParagraph[] = [];

  for (const paragraph of paragraphs) {
    throwIfAborted(signal);

    const text = normalizer.normalize(paragraph.text, options);

    if (text.length === 0) {
      continue;
    }

    result.push({
      ...paragraph,
      text,
    });
  }

  return result;
}

function normalizeHeadings(
  headings: readonly DocumentHeading[],
  normalizer: TextNormalizer,
  options: TextNormalizationOptions,
  signal?: AbortSignal,
): DocumentHeading[] {
  const result: DocumentHeading[] = [];

  for (const heading of headings) {
    throwIfAborted(signal);

    const text = normalizer.normalize(heading.text, options);

    if (text.length === 0) {
      continue;
    }

    result.push({
      ...heading,
      text,
      level: clampHeadingLevel(heading.level),
    });
  }

  return result;
}

function normalizeSections(
  sections: readonly DocumentSection[],
  normalizer: TextNormalizer,
  options: TextNormalizationOptions,
  signal?: AbortSignal,
): DocumentSection[] {
  const result: DocumentSection[] = [];

  for (const section of sections) {
    throwIfAborted(signal);

    const title = section.title
      ? normalizer.normalize(section.title, options)
      : undefined;

    const paragraphs = normalizeParagraphs(
      section.paragraphs,
      normalizer,
      options,
      signal,
    );

    const headings = normalizeHeadings(
      section.headings,
      normalizer,
      options,
      signal,
    );

    throwIfAborted(signal);

    if (title || paragraphs.length > 0 || headings.length > 0) {
      result.push({
        ...section,
        title,
        paragraphs,
        headings,
      });
    }
  }

  return result;
}

function normalizeTables(
  tables: readonly DocumentTable[],
  normalizer: TextNormalizer,
  options: TextNormalizationOptions,
  signal?: AbortSignal,
): DocumentTable[] {
  const result: DocumentTable[] = [];

  for (const table of tables) {
    throwIfAborted(signal);

    const headers = table.headers
      ? table.headers.map((header) => normalizer.normalize(header, options))
      : undefined;

    const cells = [];

    for (const cell of table.cells) {
      throwIfAborted(signal);

      cells.push({
        ...cell,
        text: normalizer.normalize(cell.text, options),
      });
    }

    result.push({
      ...table,
      headers,
      cells,
    });
  }

  return result;
}

function clampHeadingLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }

  return Math.min(6, Math.max(1, Math.trunc(level)));
}

function countWords(text: string): number {
  const normalized = text.trim();

  return normalized ? normalized.split(/\s+/u).length : 0;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw DocumentError.aborted(
    {
      stage: "normalization",
    },
    signal.reason,
  );
}
