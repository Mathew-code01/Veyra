// ============================================================================
// FILE: core/documents/parsers/MarkdownParser.ts
// PURPOSE:
// Markdown parser.
//
// This implementation deliberately avoids coupling the document core
// to a specific Markdown package. A Markdown renderer/parser can later
// be injected if richer AST support is required.
// ============================================================================

import {
  DocumentType,
  type DocumentHeading,
  type DocumentParagraph,
  type DocumentSection,
  type DocumentSource,
  type ParsedDocument,
} from "../DocumentTypes";

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import {
  assertSourceData,
  cleanParserText,
  createDocumentIdentity,
  decodeUtf8,
} from "./ParserUtils";

import type { DocumentParser } from "./DocumentParser";

export class MarkdownParser implements DocumentParser {
  public readonly type = DocumentType.MARKDOWN;

  public async parse(source: DocumentSource): Promise<ParsedDocument> {
    const data = assertSourceData(source.data, "Markdown");

    try {
      const identity = createDocumentIdentity(source);

      const rawMarkdown = decodeUtf8(data);

      const text = cleanParserText(stripMarkdownSyntax(rawMarkdown));

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.PARSE_FAILED,
          "No readable content was found in the Markdown document.",
          {
            filename: source.filename,
            documentType: DocumentType.MARKDOWN,
          },
        );
      }

      const headings = extractHeadings(rawMarkdown);

      const paragraphs = extractParagraphs(rawMarkdown, identity.id);

      const sections = buildSections(headings, paragraphs);

      return {
        identity,
        type: DocumentType.MARKDOWN,
        text,
        paragraphs,
        headings,
        sections,
        tables: extractMarkdownTables(rawMarkdown, identity.id),
        metadata: {
          filename: source.filename,
          mimeType: source.mimeType,
          fileSizeBytes: data.byteLength,
          characterCount: text.length,
          wordCount: countWords(text),
          title: headings[0]?.text,
        },
        warnings: [],
      };
    } catch (error) {
      if (error instanceof DocumentError) {
        throw error;
      }

      throw DocumentError.from(error, DocumentErrorCode.PARSE_FAILED, {
        filename: source.filename,
        documentType: DocumentType.MARKDOWN,
      });
    }
  }
}

function extractHeadings(markdown: string): DocumentHeading[] {
  const headings: DocumentHeading[] = [];

  const lines = markdown.split("\n");

  let order = 0;

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line.trim());

    if (!match) {
      continue;
    }

    headings.push({
      id: `heading:${order}`,
      text: match[2].trim(),
      level: match[1].length,
      order,
    });

    order++;
  }

  return headings;
}

function extractParagraphs(
  markdown: string,
  documentId: string,
): DocumentParagraph[] {
  const blocks = markdown
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraphs: DocumentParagraph[] = [];

  let order = 0;

  for (const block of blocks) {
    if (/^#{1,6}\s+/u.test(block)) {
      continue;
    }

    const text = stripMarkdownSyntax(block).trim();

    if (!text) {
      continue;
    }

    paragraphs.push({
      id: `${documentId}:paragraph:${order}`,
      text,
      order,
    });

    order++;
  }

  return paragraphs;
}

function buildSections(
  headings: readonly DocumentHeading[],
  paragraphs: readonly DocumentParagraph[],
): DocumentSection[] {
  if (headings.length === 0) {
    return [];
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];

    const startOrder = heading.order;

    const endOrder = nextHeading?.order ?? Number.MAX_SAFE_INTEGER;

    const sectionParagraphs = paragraphs.filter(
      (paragraph) =>
        paragraph.order >= startOrder && paragraph.order < endOrder,
    );

    return {
      id: `section:${index}`,
      title: heading.text,
      level: heading.level,
      order: index,
      headings: [heading],
      paragraphs: sectionParagraphs,
    };
  });
}

function stripMarkdownSyntax(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/gu, (block) =>
      block.replace(/^```[^\n]*\n?/u, "").replace(/```$/u, ""),
    )
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/^\s*[-*+]\s+/gmu, "")
    .replace(/^\s*\d+\.\s+/gmu, "")
    .replace(/^\s*>\s?/gmu, "")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/\*([^*]+)\*/gu, "$1")
    .replace(/_([^_]+)_/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1");
}

function extractMarkdownTables(markdown: string, documentId: string) {
  const lines = markdown.split("\n");
  const tables = [];

  for (let index = 0; index < lines.length - 1; index++) {
    const header = lines[index].trim();
    const separator = lines[index + 1].trim();

    if (
      !header.includes("|") ||
      !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/u.test(separator)
    ) {
      continue;
    }

    const headers = splitTableRow(header);

    const cells = [];

    let row = 0;
    let cursor = index + 2;

    while (cursor < lines.length && lines[cursor].includes("|")) {
      const values = splitTableRow(lines[cursor]);

      values.forEach((value, column) => {
        cells.push({
          row,
          column,
          text: stripMarkdownSyntax(value).trim(),
        });
      });

      row++;
      cursor++;
    }

    tables.push({
      id: `${documentId}:table:${tables.length}`,
      order: tables.length,
      headers,
      cells,
    });

    index = cursor - 1;
  }

  return tables;
}

function splitTableRow(row: string): string[] {
  return row
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((value) => value.trim());
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
