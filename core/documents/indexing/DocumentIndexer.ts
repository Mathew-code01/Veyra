
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
//
// INDEX SCHEMA VERSION:
// Increment DOCUMENT_INDEX_SCHEMA_VERSION whenever the shape/meaning of
// IndexDocument or IndexMetadata changes in a way that requires consumers
// to rebuild or migrate stored index records.
// ============================================================================

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import type {
  DocumentChunk,
  NormalizedDocument,
} from "../DocumentTypes";

import type {
  IndexBatch,
  IndexDocument,
} from "./IndexDocument";

import type { IndexMetadata } from "./IndexMetadata";

/**
 * Version of the canonical document-index record schema.
 *
 * Keep this value independent from the document-processing pipeline version.
 *
 * Increment this when the persisted/indexed representation changes.
 */
export const DOCUMENT_INDEX_SCHEMA_VERSION = 1;

export interface DocumentIndexingOptions {
  readonly signal?: AbortSignal;
}

export class DocumentIndexer {
  public createIndexBatch(
    document: NormalizedDocument,
    chunks: readonly DocumentChunk[],
    options: DocumentIndexingOptions = {},
  ): IndexBatch {
    if (!document) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A normalized document is required for indexing.",
        {
          stage: "indexing",
        },
      );
    }

    const documentId = document.identity?.id?.trim();

    if (!documentId) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Cannot index a document without an ID.",
        {
          stage: "indexing",
        },
      );
    }

    try {
      this.throwIfAborted(
        options.signal,
        documentId,
        document.type,
      );

      const createdAt = new Date().toISOString();

      const documents: IndexDocument[] = [];

      for (const chunk of chunks) {
        this.throwIfAborted(
          options.signal,
          documentId,
          document.type,
        );

        if (!chunk) {
          throw new Error(
            "Indexing received an invalid chunk.",
          );
        }

        if (chunk.documentId !== documentId) {
          throw new Error(
            `Chunk "${chunk.id}" belongs to document "${chunk.documentId}", expected "${documentId}".`,
          );
        }

        if (!chunk.id.trim()) {
          throw new Error(
            "Indexing received a chunk without an ID.",
          );
        }

        if (!chunk.text.trim()) {
          continue;
        }

        const metadata: IndexMetadata = {
          /**
           * Chunk metadata comes first so canonical document/index
           * fields below cannot accidentally be overridden.
           */
          ...(chunk.metadata ?? {}),

          documentId,

          chunkId: chunk.id,

          documentType: document.type,

          documentName:
            document.metadata.title ??
            document.metadata.filename ??
            document.identity.filename,

          filename:
            document.metadata.filename ??
            document.identity.filename,

          mimeType: document.metadata.mimeType,

          chunkIndex: chunk.index,

          startOffset: chunk.source.startOffset,

          endOffset: chunk.source.endOffset,

          pageNumber: chunk.source.pageNumber,

          sectionId: chunk.source.sectionId,

          createdAt: document.metadata.createdAt,

          updatedAt: document.metadata.modifiedAt,

          checksum: document.metadata.checksum,
        };

        documents.push({
          id: chunk.id,

          documentId,

          chunkId: chunk.id,

          text: chunk.text,

          metadata,

          createdAt,
        });
      }

      this.throwIfAborted(
        options.signal,
        documentId,
        document.type,
      );

      return {
        documentId,

        documents,

        createdAt,
      };
    } catch (error) {
      if (error instanceof DocumentError) {
        throw error;
      }

      throw DocumentError.from(
        error,
        DocumentErrorCode.INDEXING_FAILED,
        {
          documentId,
          documentType: document.type,
          stage: "indexing",
        },
      );
    }
  }

  private throwIfAborted(
    signal: AbortSignal | undefined,
    documentId: string,
    documentType: string,
  ): void {
    if (!signal?.aborted) {
      return;
    }

    throw DocumentError.aborted(
      {
        documentId,
        documentType,
        stage: "indexing",
      },
      signal.reason,
    );
  }
}
