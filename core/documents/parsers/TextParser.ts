// ============================================================================
// FILE: core/documents/parsers/TextParser.ts
// PURPOSE:
// Parser for plain-text documents.
//
// Supported examples:
// .txt
// .text
// ============================================================================

import {
  DocumentType,
  type DocumentSource,
  type ParsedDocument,
} from "../DocumentTypes";

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import {
  assertSourceData,
  cleanParserText,
  createDocumentIdentity,
  decodeUtf8,
  splitIntoParagraphs,
} from "./ParserUtils";

import type { DocumentParser } from "./DocumentParser";

export interface TextParserOptions {
  readonly encoding?: string;
}

export class TextParser implements DocumentParser {
  public readonly type = DocumentType.TXT;

  public constructor(private readonly options: TextParserOptions = {}) {}

  public async parse(source: DocumentSource): Promise<ParsedDocument> {
    const data = assertSourceData(source.data, "text");

    try {
      const rawText = decodeUtf8(data);

      const text = cleanParserText(rawText);

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.PARSE_FAILED,
          "No readable text was found in the text document.",
          {
            filename: source.filename,
            documentType: DocumentType.TXT,
          },
        );
      }

      const identity = createDocumentIdentity(source);

      return {
        identity,
        type: DocumentType.TXT,
        text,
        paragraphs: splitIntoParagraphs(text, identity.id),
        headings: [],
        sections: [],
        tables: [],
        metadata: {
          filename: source.filename,
          mimeType: source.mimeType,
          fileSizeBytes: data.byteLength,
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
        documentType: DocumentType.TXT,
      });
    }
  }
}

function countWords(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/u).length;
}
