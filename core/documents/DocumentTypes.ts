// ============================================================================
// FILE: core/documents/DocumentTypes.ts
// PURPOSE:
// Canonical domain contracts for the Veyra document-processing subsystem.
//
// ARCHITECTURAL RESPONSIBILITY:
// Defines what a document IS.
// It does not parse files, access databases, perform AI calls, or perform I/O.
//
// PIPELINE:
// FileInput
//   -> validation
//   -> classification
//   -> parsing
//   -> extraction
//   -> normalization
//   -> chunking
//   -> indexing
//   -> persistence
// ============================================================================

import type { DocumentMetadata } from "./DocumentMetadata";

/**
 * Supported document formats.
 *
 * This represents the logical format of a document rather than
 * the raw MIME type supplied by the operating system.
 */
export enum DocumentType {
  PDF = "pdf",
  DOCX = "docx",
  TXT = "txt",
  HTML = "html",
  MARKDOWN = "markdown",
  UNKNOWN = "unknown",
}

/**
 * Source from which a document originated.
 */
export enum DocumentSourceType {
  FILE = "file",
  MEMORY = "memory",
  URL = "url",
  DATABASE = "database",
  GENERATED = "generated",
}

/**
 * Processing lifecycle.
 */
export enum DocumentProcessingStatus {
  PENDING = "pending",
  VALIDATING = "validating",
  CLASSIFYING = "classifying",
  PARSING = "parsing",
  EXTRACTING = "extracting",
  NORMALIZING = "normalizing",
  CHUNKING = "chunking",
  INDEXING = "indexing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Processing stage names.
 */
export enum DocumentProcessingStage {
  VALIDATION = "validation",
  CLASSIFICATION = "classification",
  PARSING = "parsing",
  EXTRACTION = "extraction",
  NORMALIZATION = "normalization",
  CHUNKING = "chunking",
  INDEXING = "indexing",
  STORAGE = "storage",
}

/**
 * A document source.
 */
export interface DocumentSource {
  readonly type: DocumentSourceType;

  /**
   * Original filename when available.
   */
  readonly filename?: string;

  /**
   * Absolute or provider-specific path when available.
   */
  readonly path?: string;

  /**
   * MIME type supplied by the caller/provider.
   */
  readonly mimeType?: string;

  /**
   * Raw document bytes.
   */
  readonly data?: Uint8Array;

  /**
   * Source URL when applicable.
   */
  readonly url?: string;

  /**
   * Optional external identifier.
   */
  readonly externalId?: string;
}

/**
 * Basic document identity.
 */
export interface DocumentIdentity {
  /**
   * Stable application-level document ID.
   */
  readonly id: string;

  /**
   * Optional checksum used for deduplication/integrity.
   */
  readonly checksum?: string;

  /**
   * Original filename.
   */
  readonly filename?: string;
}

/**
 * A paragraph inside a document.
 */
export interface DocumentParagraph {
  readonly id: string;
  readonly text: string;
  readonly order: number;
  readonly pageNumber?: number;
  readonly sectionId?: string;
}

/**
 * A document heading.
 */
export interface DocumentHeading {
  readonly id: string;
  readonly text: string;
  readonly level: number;
  readonly order: number;
  readonly pageNumber?: number;
}

/**
 * A document section.
 */
export interface DocumentSection {
  readonly id: string;
  readonly title?: string;
  readonly level: number;
  readonly order: number;
  readonly paragraphs: readonly DocumentParagraph[];
  readonly headings: readonly DocumentHeading[];
}

/**
 * A table cell.
 */
export interface DocumentTableCell {
  readonly row: number;
  readonly column: number;
  readonly text: string;
}

/**
 * A document table.
 */
export interface DocumentTable {
  readonly id: string;
  readonly order: number;
  readonly pageNumber?: number;
  readonly headers?: readonly string[];
  readonly cells: readonly DocumentTableCell[];
}

/**
 * Raw parser output.
 *
 * Parsers should produce this representation and should not
 * perform indexing or persistence.
 */
export interface ParsedDocument {
  readonly identity: DocumentIdentity;
  readonly type: DocumentType;

  /**
   * Raw extracted text.
   */
  readonly text: string;

  /**
   * Optional structured information.
   */
  readonly paragraphs?: readonly DocumentParagraph[];
  readonly headings?: readonly DocumentHeading[];
  readonly sections?: readonly DocumentSection[];
  readonly tables?: readonly DocumentTable[];

  /**
   * Parser-produced metadata.
   */
  readonly metadata?: DocumentMetadata;

  /**
   * Parser-specific diagnostics.
   */
  readonly warnings?: readonly string[];
}

/**
 * Normalized document.
 */
export interface NormalizedDocument {
  readonly identity: DocumentIdentity;
  readonly type: DocumentType;
  readonly text: string;

  readonly paragraphs: readonly DocumentParagraph[];
  readonly headings: readonly DocumentHeading[];
  readonly sections: readonly DocumentSection[];
  readonly tables: readonly DocumentTable[];

  readonly metadata: DocumentMetadata;

  readonly normalizedAt: string;
}

/**
 * Chunk provenance.
 */
export interface DocumentChunkSource {
  readonly documentId: string;
  readonly pageNumber?: number;
  readonly sectionId?: string;
  readonly paragraphIds?: readonly string[];
  readonly startOffset?: number;
  readonly endOffset?: number;
}

/**
 * A chunk is the unit normally consumed by indexing/retrieval.
 */
export interface DocumentChunk {
  readonly id: string;

  readonly documentId: string;

  readonly index: number;

  readonly text: string;

  readonly tokenEstimate?: number;

  readonly source: DocumentChunkSource;

  /**
   * Additional document-specific chunk metadata.
   *
   * Kept generic so the canonical document type does not become
   * tightly coupled to a particular indexing/vector database.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Complete processed document.
 */
export interface ProcessedDocument {
  readonly identity: DocumentIdentity;
  readonly type: DocumentType;
  readonly text: string;

  readonly metadata: DocumentMetadata;

  readonly paragraphs: readonly DocumentParagraph[];
  readonly headings: readonly DocumentHeading[];
  readonly sections: readonly DocumentSection[];
  readonly tables: readonly DocumentTable[];
  readonly chunks: readonly DocumentChunk[];

  readonly status: DocumentProcessingStatus;
  readonly processedAt: string;

  readonly warnings: readonly string[];
}

/**
 * Pipeline progress event.
 */
export interface DocumentProcessingProgress {
  readonly documentId?: string;
  readonly stage: DocumentProcessingStage;
  readonly status: DocumentProcessingStatus;
  readonly progress: number;
  readonly message?: string;
  readonly timestamp: string;
}

/**
 * Processing options.
 */
export interface DocumentProcessingOptions {
  readonly maxFileSizeBytes?: number;

  readonly generateChunks?: boolean;

  readonly chunkSize?: number;

  readonly chunkOverlap?: number;

  readonly preserveStructure?: boolean;

  readonly extractTables?: boolean;

  readonly extractMetadata?: boolean;

  readonly strictValidation?: boolean;

  readonly signal?: AbortSignal;

  readonly onProgress?: (progress: DocumentProcessingProgress) => void;
}

/**
 * Top-level document processing request.
 */
export interface DocumentProcessingRequest {
  readonly source: DocumentSource;

  readonly options?: DocumentProcessingOptions;

  readonly documentId?: string;
}
