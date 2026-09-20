// ============================================================================
// FILE: core/documents/DocumentContextSink.ts
// PURPOSE:
// Defines the document-side boundary for publishing processed documents
// into the generic context subsystem.
//
// ARCHITECTURE:
//
//   core/documents
//        |
//        | DocumentContextSink
//        v
//   context adapter
//        |
//        v
//   core/context
//
// IMPORTANT:
// DocumentService depends on this interface only.
//
// It does NOT import:
//   - ContextManager
//   - EmbeddingService
//   - VectorStore
//   - Retriever
//   - ContextRanker
//   - ContextCompressor
//
// The concrete ContextDocumentIndexer implements this boundary.
//
// This keeps core/context generic and prevents the document subsystem
// from becoming tightly coupled to a particular context implementation.
// ============================================================================

import type { ProcessedDocument } from "./DocumentTypes";

import type { IndexBatch } from "./indexing/IndexDocument";

export interface DocumentContextIndexOptions {
  /**
   * Optional cancellation signal owned by the document-processing request.
   */
  readonly signal?: AbortSignal;
}

/**
 * Document -> Context publishing boundary.
 *
 * A context implementation can consume the canonical processed document
 * together with the index-neutral chunk batch produced by DocumentIndexer.
 *
 * The sink is deliberately asynchronous because production context
 * ingestion normally performs:
 *
 *   chunks
 *      ↓
 *   embeddings
 *      ↓
 *   vector-store writes
 */
export interface DocumentContextSink {
  index(
    document: ProcessedDocument,
    batch: IndexBatch,
    options?: DocumentContextIndexOptions,
  ): Promise<void>;

  /**
   * Removes all context/vector records associated with a document.
   *
   * This is useful when a document is deleted or replaced.
   */
  remove(
    documentId: string,
    options?: DocumentContextIndexOptions,
  ): Promise<void>;
}
