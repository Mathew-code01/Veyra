// ============================================================================
// FILE: core/documents/parsers/DOCXParser.ts
// PURPOSE:
// DOCX parser using dependency injection.
//
// DOCX is a ZIP/OpenXML container. The actual implementation can be
// backed by Mammoth, JSZip/OpenXML processing, or another provider.
//
// The core document layer does not depend on the concrete package.
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

export interface DOCXTextProvider {
  extractText(buffer: Uint8Array): Promise<string>;
}

export interface DOCXDocumentProvider {
  extract(buffer: Uint8Array): Promise<{
    readonly text: string;
    readonly title?: string;
    readonly author?: string;
    readonly createdAt?: string;
    readonly modifiedAt?: string;
  }>;
}

export class DOCXParser implements DocumentParser {
  public readonly type = DocumentType.DOCX;

  public constructor(
    private readonly provider: DOCXTextProvider | DOCXDocumentProvider,
  ) {}

  public async parse(source: DocumentSource): Promise<ParsedDocument> {
    const data = assertSourceData(source.data, "DOCX");

    try {
      const result = await this.extract(data);

      const text = cleanParserText(result.text);

      if (!text) {
        throw new DocumentError(
          DocumentErrorCode.PARSE_FAILED,
          "No extractable text was found in the DOCX.",
          {
            filename: source.filename,
            documentType: DocumentType.DOCX,
          },
        );
      }

      const identity = createDocumentIdentity(source);

      return {
        identity,
        type: DocumentType.DOCX,
        text,
        paragraphs: splitIntoParagraphs(text, identity.id),
        headings: [],
        sections: [],
        tables: [],
        metadata: {
          filename: source.filename,
          mimeType:
            source.mimeType ||
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileSizeBytes: data.byteLength,
          title: result.title,
          author: result.author,
          createdAt: result.createdAt,
          modifiedAt: result.modifiedAt,
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
        documentType: DocumentType.DOCX,
      });
    }
  }

  private async extract(buffer: Uint8Array): Promise<{
    readonly text: string;
    readonly title?: string;
    readonly author?: string;
    readonly createdAt?: string;
    readonly modifiedAt?: string;
  }> {
    const provider = this.provider;

    if ("extract" in provider && typeof provider.extract === "function") {
      return provider.extract(buffer);
    }

    return {
      text: await (provider as DOCXTextProvider).extractText(buffer),
    };
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
