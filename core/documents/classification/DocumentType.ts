// ============================================================================
// FILE: core/documents/classification/DocumentType.ts
// PURPOSE:
// Classification contracts for document formats.
// ============================================================================

import { DocumentType } from "../DocumentTypes";

export interface DocumentTypeDetectionResult {
  readonly type: DocumentType;

  readonly confidence: number;

  readonly source: "mime" | "extension" | "content" | "fallback";

  readonly mimeType?: string;

  readonly extension?: string;

  readonly warnings: readonly string[];
}

/**
 * Supported document format information.
 */
export interface DocumentFormatDefinition {
  readonly type: DocumentType;

  readonly extensions: readonly string[];

  readonly mimeTypes: readonly string[];

  readonly description: string;

  readonly binary: boolean;
}

/**
 * Canonical format definitions.
 */
export const DOCUMENT_FORMATS: readonly DocumentFormatDefinition[] = [
  {
    type: DocumentType.PDF,
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    description: "Portable Document Format",
    binary: true,
  },
  {
    type: DocumentType.DOCX,
    extensions: [".docx"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    description: "Microsoft Word Open XML document",
    binary: true,
  },
  {
    type: DocumentType.TXT,
    extensions: [".txt", ".text"],
    mimeTypes: ["text/plain"],
    description: "Plain text document",
    binary: false,
  },
  {
    type: DocumentType.HTML,
    extensions: [".html", ".htm"],
    mimeTypes: ["text/html"],
    description: "HTML document",
    binary: false,
  },
  {
    type: DocumentType.MARKDOWN,
    extensions: [".md", ".markdown"],
    mimeTypes: ["text/markdown"],
    description: "Markdown document",
    binary: false,
  },
];
