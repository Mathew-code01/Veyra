// ============================================================================
// FILE: core/documents/indexing/IndexDocument.ts
// PURPOSE:
// Canonical index-neutral representation.
//
// This is the boundary between document processing and retrieval/indexing
// infrastructure.
// ============================================================================

import type { IndexMetadata } from "./IndexMetadata";

export interface IndexDocument {
  readonly id: string;

  readonly documentId: string;

  readonly chunkId?: string;

  readonly text: string;

  readonly metadata: IndexMetadata;

  /**
   * Embeddings are intentionally optional.
   *
   * Embedding generation belongs to core/context or an embedding service,
   * not to document ingestion itself.
   */
  readonly embedding?: readonly number[];

  readonly createdAt: string;
}

export interface IndexBatch {
  readonly documents: readonly IndexDocument[];

  readonly documentId: string;

  readonly createdAt: string;
}
