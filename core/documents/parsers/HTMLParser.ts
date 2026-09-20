// ============================================================================
// FILE: core/documents/parsers/HTMLParser.ts
// PURPOSE:
// HTML document parser.
//
// SECURITY:
// HTML is treated as untrusted input.
// Script/style content is discarded before text extraction.
// No HTML is executed.
// ============================================================================

import {
  DocumentType,
  type DocumentHeading,
  type DocumentParagraph,
  type DocumentSource,
  type ParsedDocument,
} from "../DocumentTypes";

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import {
  assertSourceData,
  createDocumentIdentity,
  decodeUtf8,
  cleanParserText,
} from "./ParserUtils";

import type { DocumentParser } from "./DocumentParser";

export class HTMLParser implements DocumentParser {
  public readonly type = DocumentType.HTML;

  public async parse(source: DocumentSource): Promise<ParsedDocument> {
    const data = assertSourceData(source.data, "HTML");

    try {
      const identity = createDocumentIdentity(source);

      const html = decodeUtf8(data);

      const cleanedHtml = removeUnsafeContent(html);

      const title = extractHtmlTitle(cleanedHtml);

      const headings = extractHtmlHeadings(cleanedHtml);

      const paragraphs = extractHtmlParagraphs(cleanedHtml, identity.id);

      const text = cleanParserText(htmlToText(cleanedHtml));

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.PARSE_FAILED,
          "No readable text was found in the HTML document.",
          {
            filename: source.filename,
            documentType: DocumentType.HTML,
          },
        );
      }

      return {
        identity,
        type: DocumentType.HTML,
        text,
        paragraphs,
        headings,
        sections: [],
        tables: [],
        metadata: {
          filename: source.filename,
          mimeType: source.mimeType,
          fileSizeBytes: data.byteLength,
          title,
          characterCount: text.length,
          wordCount: countWords(text),
        },
        warnings: [],
      };
    } catch (error) {
      if (error instanceof DocumentError) {
        throw error;
      }

      throw DocumentError.from(error, DocumentErrorCode.PARSE_FAILED, {
        filename: source.filename,
        documentType: DocumentType.HTML,
      });
    }
  }
}

function removeUnsafeContent(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, "");
}

function extractHtmlTitle(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html);

  if (!match) {
    return undefined;
  }

  return decodeHtmlEntities(stripTags(match[1]).trim()) || undefined;
}

function extractHtmlHeadings(html: string): DocumentHeading[] {
  const headings: DocumentHeading[] = [];

  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu;

  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = pattern.exec(html)) !== null) {
    const text = cleanParserText(decodeHtmlEntities(stripTags(match[2])));

    if (!text) {
      continue;
    }

    headings.push({
      id: `heading:${order}`,
      text,
      level: Number(match[1]),
      order,
    });

    order++;
  }

  return headings;
}

function extractHtmlParagraphs(
  html: string,
  documentId: string,
): DocumentParagraph[] {
  const paragraphs: DocumentParagraph[] = [];

  const pattern =
    /<(?:p|article|section|li|blockquote)\b[^>]*>([\s\S]*?)<\/(?:p|article|section|li|blockquote)>/giu;

  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = pattern.exec(html)) !== null) {
    const text = cleanParserText(decodeHtmlEntities(stripTags(match[1])));

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

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(
        /<(?:br|\/p|\/div|\/section|\/article|\/li|\/h[1-6])\s*\/?>/giu,
        "\n",
      )
      .replace(/<[^>]+>/gu, " "),
  );
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/gu, " ");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
