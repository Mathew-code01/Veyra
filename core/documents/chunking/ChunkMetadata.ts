// ============================================================================
// FILE: core/documents/chunking/ChunkMetadata.ts
// PURPOSE:
// Canonical metadata attached to document chunks.
//
// ARCHITECTURE:
// This metadata describes where a chunk came from.
// It does not perform retrieval, embeddings, or vector storage.
// ============================================================================

import type {
  DocumentChunkSource,
  DocumentHeading,
  DocumentSection,
  DocumentTable,
} from "../DocumentTypes";

export interface ChunkMetadata {
  readonly documentId: string;

  readonly documentType?: string;

  readonly chunkIndex: number;

  readonly characterCount: number;

  readonly tokenEstimate?: number;

  readonly source: DocumentChunkSource;

  readonly sectionTitle?: string;

  readonly headingPath?: readonly string[];

  readonly pageNumber?: number;

  readonly paragraphIds?: readonly string[];

  readonly tableIds?: readonly string[];

  readonly headings?: readonly DocumentHeading[];

  readonly sections?: readonly DocumentSection[];

  readonly tables?: readonly DocumentTable[];

  readonly [key: string]: unknown;
}

export function estimateTokens(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  /*
   * This is deliberately an estimate.
   *
   * Actual token counts depend on the tokenizer used by the
   * downstream embedding/LLM model.
   */
  return Math.ceil(normalized.length / 4);
}
