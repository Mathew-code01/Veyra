// ============================================================================
// FILE: core/documents/indexing/DocumentIndexer.ts
// PURPOSE:
// Converts processed document chunks into index-neutral records.
//
// RESPONSIBILITY:
// DocumentChunk[] -> IndexDocument[]
//
// DOES NOT:
// - generate embeddings
// - write to a database
// - choose a vector database
// - perform retrieval
// ============================================================================

import type { DocumentChunk, NormalizedDocument } from "../DocumentTypes";

import type { IndexBatch, IndexDocument } from "./IndexDocument";

import type { IndexMetadata } from "./IndexMetadata";

export interface DocumentIndexingOptions {
  readonly signal?: AbortSignal;
}

export class DocumentIndexer {
  public createIndexBatch(
    document: NormalizedDocument,
    chunks: readonly DocumentChunk[],
    options: DocumentIndexingOptions = {},
  ): IndexBatch {
    this.throwIfAborted(options.signal);

    const createdAt = new Date().toISOString();

    const documents: IndexDocument[] = [];

    for (const chunk of chunks) {
      this.throwIfAborted(options.signal);

      const metadata: IndexMetadata = {
        documentId: document.identity.id,
        chunkId: chunk.id,
        documentType: document.type,
        documentName: document.identity.filename,
        filename: document.identity.filename,
        chunkIndex: chunk.index,
        startOffset: chunk.source.startOffset,
        endOffset: chunk.source.endOffset,
        pageNumber: chunk.source.pageNumber,
        sectionId: chunk.source.sectionId,
      };

      documents.push({
        id: chunk.id,
        documentId: document.identity.id,
        chunkId: chunk.id,
        text: chunk.text,
        metadata,
        createdAt,
      });
    }

    return {
      documentId: document.identity.id,
      documents,
      createdAt,
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Document indexing was cancelled.");
  }
}
