// ============================================================================
// FILE: core/documents/parsers/SafeDocumentAdapters.ts
//
// PURPOSE:
// Safe, compliant parser provider adapters for PDF and DOCX formats that
// operate without external dependencies, inspecting binary signatures and
// extracting readable text streams or reporting explicit format status.
// ============================================================================

import { DocumentError, DocumentErrorCode } from "../DocumentError";
import type { PDFDocumentProvider, PDFParserResult } from "./PDFParser";
import type { DOCXDocumentProvider } from "./DOCXParser";

/**
 * Safe PDF text provider that inspects PDF binary headers (%PDF-) and extracts
 * plain text operators from PDF streams without requiring native C++ or external binaries.
 */
export class SafePDFProvider implements PDFDocumentProvider {
  public async extract(buffer: Uint8Array): Promise<PDFParserResult> {
    // 1. Verify PDF Magic Bytes (%PDF-)
    const header = Buffer.from(buffer.slice(0, 8)).toString("utf8");
    if (!header.startsWith("%PDF-")) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "File is not a valid PDF document (missing %PDF- header).",
      );
    }

    // 2. Extract uncompressed text streams / text blocks
    const fullContent = Buffer.from(buffer).toString("latin1");

    // Extract text in PDF text objects (BT ... ET) or standard parentheses Tj/TJ operators
    const textPieces: string[] = [];
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let match: RegExpExecArray | null;

    while ((match = tjRegex.exec(fullContent)) !== null) {
      const decoded = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\([()\\])/g, "$1");
      if (decoded.trim().length > 0) {
        textPieces.push(decoded);
      }
    }

    // Try bracketed TJ arrays: [(text) 20 (more)] TJ
    const arrayRegex = /\[([^\]]+)\]\s*TJ/gi;
    while ((match = arrayRegex.exec(fullContent)) !== null) {
      const innerTjRegex = /\(([^)]+)\)/g;
      let innerMatch: RegExpExecArray | null;
      while ((innerMatch = innerTjRegex.exec(match[1])) !== null) {
        if (innerMatch[1].trim().length > 0) {
          textPieces.push(innerMatch[1]);
        }
      }
    }

    const extractedText = textPieces.join(" ").replace(/\s{2,}/g, " ").trim();

    // Estimate page count
    const pageMatches = fullContent.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 1;

    if (!extractedText || extractedText.length < 10) {
      // PDF might be compressed or an image scan
      throw new DocumentError(
        DocumentErrorCode.PARSE_FAILED,
        "PDF text extraction failed: Document streams are compressed with FlateDecode or contain scanned images. A dedicated pdf-parse provider is required for compressed streams.",
      );
    }

    return {
      text: extractedText,
      pageCount,
    };
  }
}

/**
 * Safe DOCX text provider that validates OpenXML/ZIP container signatures (PK\x03\x04)
 * and extracts <w:t> XML text nodes.
 */
export class SafeDOCXProvider implements DOCXDocumentProvider {
  public async extract(buffer: Uint8Array): Promise<{
    readonly text: string;
    readonly title?: string;
    readonly author?: string;
    readonly createdAt?: string;
    readonly modifiedAt?: string;
  }> {
    // 1. Verify ZIP/DOCX Magic Bytes (PK\x03\x04)
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "File is not a valid DOCX document (missing PK zip signature).",
      );
    }

    // 2. Scan for WordprocessingML text tags <w:t> or <w:t xml:space="preserve">
    const raw = Buffer.from(buffer).toString("utf8");
    const textPieces: string[] = [];
    const wtRegex = /<w:t(?:[^>]*)>([^<]+)<\/w:t>/g;
    let match: RegExpExecArray | null;

    while ((match = wtRegex.exec(raw)) !== null) {
      if (match[1].trim().length > 0) {
        textPieces.push(match[1]);
      }
    }

    const extractedText = textPieces.join(" ").replace(/\s{2,}/g, " ").trim();

    if (!extractedText || extractedText.length < 10) {
      // DOCX contains deflate-compressed zip entries which require standard zip decompression
      throw new DocumentError(
        DocumentErrorCode.PARSE_FAILED,
        "DOCX text extraction failed: Document XML parts are compressed. A standard mammoth or JSZip provider is required for compressed DOCX archives.",
      );
    }

    return {
      text: extractedText,
    };
  }
}
