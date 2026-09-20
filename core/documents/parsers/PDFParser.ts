// ============================================================================
// FILE: core/documents/parsers/PDFParser.ts
// PURPOSE:
// PDF parser using dependency injection.
//
// The parser does not know which PDF library is being used.
// A PDFTextProvider can be backed by pdfjs, pdf-parse, another
// implementation, or a future native runtime.
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
  splitIntoParagraphs,
} from "./ParserUtils";

import type { DocumentParser } from "./DocumentParser";

export interface PDFTextProvider {
  extractText(buffer: Uint8Array): Promise<string>;
}

export interface PDFParserResult {
  readonly text: string;

  readonly pageCount?: number;
}

export interface PDFDocumentProvider {
  extract(buffer: Uint8Array): Promise<PDFParserResult>;
}

export class PDFParser implements DocumentParser {
  public readonly type = DocumentType.PDF;

  public constructor(
    private readonly provider: PDFTextProvider | PDFDocumentProvider,
  ) {}

  public async parse(source: DocumentSource): Promise<ParsedDocument> {
    const data = assertSourceData(source.data, "PDF");

    try {
      const result = await this.extract(data);

      const text = cleanParserText(result.text);

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.PARSE_FAILED,
          "No extractable text was found in the PDF.",
          {
            filename: source.filename,
            documentType: DocumentType.PDF,
          },
        );
      }

      const identity = createDocumentIdentity(source);

      return {
        identity,
        type: DocumentType.PDF,
        text,
        paragraphs: splitIntoParagraphs(text, identity.id),
        headings: [],
        sections: [],
        tables: [],
        metadata: {
          filename: source.filename,
          mimeType: source.mimeType || "application/pdf",
          fileSizeBytes: data.byteLength,
          pageCount: result.pageCount,
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
        documentType: DocumentType.PDF,
      });
    }
  }

  private async extract(buffer: Uint8Array): Promise<PDFParserResult> {
    const provider = this.provider;

    if ("extract" in provider && typeof provider.extract === "function") {
      return provider.extract(buffer);
    }

    const text = await (provider as PDFTextProvider).extractText(buffer);

    return {
      text,
    };
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
