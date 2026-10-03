// ============================================================================
// FILE: core/context/DocumentParser.ts
// PURPOSE:
// Generic context-content normalization/parsing.
//
// IMPORTANT:
// This file is NOT a file-format parser.
//
// It does NOT parse:
//   - PDF
//   - DOCX
//   - HTML files
//   - Markdown files
//
// Those responsibilities belong to core/documents.
//
// This parser accepts already-available textual context and converts it
// into a stable representation for the context/RAG layer.
//
// Context can originate from:
//   - documents
//   - conversations
//   - memories
//   - web results
//   - tools
//   - generated content
//   - application state
// ============================================================================

export type ContextSourceType =
  | "document"
  | "conversation"
  | "memory"
  | "web"
  | "tool"
  | "generated"
  | "application"
  | "unknown";

/**
 * Semantic content classifications used by the context layer.
 *
 * These are NOT file formats.
 */
export type ContextContentType =
  | "resume"
  | "cover-letter"
  | "job-description"
  | "project"
  | "experience"
  | "skills"
  | "story"
  | "company-research"
  | "conversation"
  | "memory"
  | "web-result"
  | "tool-result"
  | "generated"
  | "generic";

/**
 * Backwards-compatible alias.
 *
 * Existing context consumers importing DocumentType do not
 * immediately need to change.
 */
export type DocumentType = ContextContentType;

export interface DocumentMetadata {
  readonly type?: ContextContentType;

  readonly sourceType?: ContextSourceType;

  readonly candidateId?: string;

  readonly source?: string;

  readonly mimeType?: string;

  readonly fileName?: string;

  readonly documentName?: string;

  readonly createdAt?: string;

  readonly updatedAt?: string;

  readonly tags?: readonly string[];

  readonly [key: string]: unknown;
}

/**
 * Generic context input.
 *
 * The context layer expects text that is already available.
 */
export interface DocumentInput {
  readonly id: string;

  readonly name: string;

  readonly type?: ContextContentType;

  readonly sourceType?: ContextSourceType;

  readonly text?: string;

  /**
   * Optional binary data for compatibility with older callers.
   *
   * The context parser deliberately does not attempt to understand
   * arbitrary binary formats.
   */
  readonly buffer?: Uint8Array;

  readonly metadata?: DocumentMetadata;
}

/**
 * Canonical context representation.
 */
export interface ParsedDocument {
  readonly id: string;

  readonly name: string;

  readonly type: ContextContentType;

  readonly sourceType: ContextSourceType;

  readonly text: string;

  readonly metadata: DocumentMetadata;
}

/**
 * Parser contract for context content.
 */
export interface DocumentParser {
  parse(input: DocumentInput): ParsedDocument;
}

/**
 * Default generic context parser.
 *
 * It performs validation and lightweight text cleanup.
 *
 * It deliberately does not parse file formats.
 */
export class DefaultDocumentParser implements DocumentParser {
  public parse(input: DocumentInput): ParsedDocument {
    this.validateInput(input);

    const text = normalizeContextText(input.text ?? "");

    if (!text) {
      throw new Error(
        `Context item "${input.name}" does not contain usable text.`,
      );
    }

    const type = input.type ?? inferContextContentType(input.sourceType);

    const sourceType = input.sourceType ?? inferSourceType(input.metadata);

    const metadata: DocumentMetadata = {
      ...input.metadata,

      type,

      sourceType,

      documentName: input.metadata?.documentName ?? input.name,
    };

    return {
      id: input.id.trim(),

      name: input.name.trim(),

      type,

      sourceType,

      text,

      metadata,
    };
  }

  private validateInput(input: DocumentInput): void {
    if (!input) {
      throw new Error("Context input is required.");
    }

    if (typeof input.id !== "string" || !input.id.trim()) {
      throw new Error("Context item ID is required.");
    }

    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new Error("Context item name is required.");
    }

    /**
     * Binary content belongs to core/documents or another
     * specialized ingestion subsystem.
     *
     * Do not silently interpret arbitrary bytes as text.
     */
    if (input.buffer !== undefined && input.text === undefined) {
      throw new Error(
        `Context item "${input.name}" contains binary data but no extracted text. ` +
          "Binary/file parsing must be performed by the appropriate ingestion layer before context parsing.",
      );
    }
  }
}

/**
 * Lightweight normalization suitable for context content.
 *
 * This intentionally does not perform aggressive semantic normalization.
 */
function normalizeContextText(text: string): string {
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferSourceType(metadata?: DocumentMetadata): ContextSourceType {
  if (metadata?.sourceType) {
    return metadata.sourceType;
  }

  return "unknown";
}

function inferContextContentType(
  sourceType?: ContextSourceType,
): ContextContentType {
  switch (sourceType) {
    case "conversation":
      return "conversation";

    case "memory":
      return "memory";

    case "web":
      return "web-result";

    case "tool":
      return "tool-result";

    case "generated":
      return "generated";

    default:
      return "generic";
  }
}
