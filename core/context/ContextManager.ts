// ============================================================================
// FILE: core/context/ContextManager.ts
// PURPOSE:
// Central orchestration service for the generic context/RAG subsystem.
//
// CONTEXT SOURCES MAY INCLUDE:
// - documents
// - conversations
// - memories
// - web
// - tools
// - generated content
// - application state
//
// IMPORTANT:
// ContextManager does NOT depend on core/documents.
//
// Documents are connected through an adapter:
//
//   core/documents/ContextDocumentIndexer
//              ↓
//   ContextManager.indexPreparedDocument()
//
// This allows the document subsystem to preserve its own parsing,
// normalization and structural chunking decisions while ContextManager
// remains responsible for embeddings, vector storage and retrieval.
// ============================================================================

import type { Chunk, Chunker } from "./Chunker";

import type {
  DocumentInput,
  DocumentParser,
  ParsedDocument,
} from "./DocumentParser";

import type { EmbeddingService } from "./EmbeddingService";

import type { VectorRecord, VectorStore } from "./VectorStore";

import type { Retriever, RetrievedContext } from "./Retriever";

import type { ContextRanker, RankedContext } from "./ContextRanker";

import type { ContextCompressor, CompressedContext } from "./ContextCompressor";

export interface ContextManagerOptions {
  readonly parser: DocumentParser;

  readonly chunker: Chunker;

  readonly embeddings: EmbeddingService;

  readonly vectorStore: VectorStore;

  readonly retriever: Retriever;

  readonly ranker: ContextRanker;

  readonly compressor: ContextCompressor;
}

export interface IndexedDocument {
  readonly document: ParsedDocument;

  readonly chunks: readonly Chunk[];
}

export interface ContextIndexOptions {
  readonly signal?: AbortSignal;
}

export interface ContextQuery {
  readonly query: string;

  readonly limit?: number;

  readonly minScore?: number;

  readonly documentIds?: readonly string[];

  readonly documentTypes?: readonly string[];

  readonly candidateId?: string;
}

export interface ContextResult {
  readonly query: string;

  readonly retrieved: readonly RetrievedContext[];

  readonly contexts: readonly RankedContext[];

  readonly compressed: CompressedContext;
}

/**
 * Central context orchestration service.
 */
export class ContextManager {
  private readonly parser: DocumentParser;

  private readonly chunker: Chunker;

  private readonly embeddings: EmbeddingService;

  private readonly vectorStore: VectorStore;

  private readonly retriever: Retriever;

  private readonly ranker: ContextRanker;

  private readonly compressor: ContextCompressor;

  /**
   * In-memory canonical context document registry.
   *
   * Production deployments can replace/augment this with a persistent
   * context repository without changing the ingestion contract.
   */
  private readonly documents = new Map<string, ParsedDocument>();

  public constructor(options: ContextManagerOptions) {
    if (!options) {
      throw new Error("ContextManager options are required.");
    }

    this.parser = options.parser;

    this.chunker = options.chunker;

    this.embeddings = options.embeddings;

    this.vectorStore = options.vectorStore;

    this.retriever = options.retriever;

    this.ranker = options.ranker;

    this.compressor = options.compressor;
  }

  /**
   * Generic context ingestion path.
   *
   * This is intentionally preserved for non-document context.
   *
   * Flow:
   *
   *   DocumentInput
   *       ↓
   *   context parser
   *       ↓
   *   generic chunker
   *       ↓
   *   embeddings
   *       ↓
   *   vector store
   */
  public async indexDocument(
    input: DocumentInput,
    options: ContextIndexOptions = {},
  ): Promise<IndexedDocument> {
    this.throwIfAborted(options.signal);

    const document = this.parser.parse(input);

    this.throwIfAborted(options.signal);

    const chunks = this.chunker.chunk(
      document.id,
      document.text,
      {
        ...document.metadata,

        type: document.type,

        sourceType: document.sourceType,

        documentName: document.name,
      },
      {
        signal: options.signal,
      },
    );

    this.throwIfAborted(options.signal);

    return this.indexPreparedDocument(document, chunks, options);
  }

  /**
   * Prepared context ingestion path.
   *
   * This is the production bridge used by core/documents.
   *
   * The caller has already:
   *
   *   - parsed the source
   *   - normalized the content
   *   - created canonical structural chunks
   *
   * Therefore ContextManager MUST NOT parse or rechunk this content.
   *
   * It is responsible only for:
   *
   *   chunks
   *      ↓
   *   embeddings
   *      ↓
   *   vector records
   *      ↓
   *   vector store
   */
  public async indexPreparedDocument(
    document: ParsedDocument,
    chunks: readonly Chunk[],
    options: ContextIndexOptions = {},
  ): Promise<IndexedDocument> {
    this.validatePreparedDocument(document);

    this.validatePreparedChunks(document, chunks);

    this.throwIfAborted(options.signal);

    /**
     * Generate embeddings before deleting the existing vector records.
     *
     * This prevents an embedding failure from immediately destroying the
     * previous searchable representation.
     *
     * Full atomic replacement still belongs to the concrete VectorStore
     * implementation when transactional semantics are available.
     */
    const embeddingResult =
      chunks.length > 0
        ? await this.embeddings.embed(chunks.map((chunk) => chunk.text))
        : {
            embeddings: [],
          };

    this.throwIfAborted(options.signal);

    if (embeddingResult.embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch for document "${document.id}". ` +
          `Expected ${chunks.length}, received ${embeddingResult.embeddings.length}.`,
      );
    }

    const records: VectorRecord[] = [];

    for (let index = 0; index < chunks.length; index += 1) {
      this.throwIfAborted(options.signal);

      const chunk = chunks[index];

      if (!chunk) {
        throw new Error(`Missing prepared context chunk at index ${index}.`);
      }

      const vector = embeddingResult.embeddings[index];

      if (!vector) {
        throw new Error(`Missing embedding for context chunk "${chunk.id}".`);
      }

      records.push({
        id: chunk.id,

        vector,

        text: chunk.text,

        documentId: document.id,

        metadata: {
          ...chunk.metadata,

          contextId: document.id,

          documentId: document.id,

          type: document.type,

          sourceType: document.sourceType,

          documentName: document.name,

          embeddingModel: embeddingResult.model,

          embeddingDimensions: embeddingResult.dimensions,
        },
      });
    }

    this.throwIfAborted(options.signal);

    /**
     * Replace the previous searchable representation.
     *
     * The VectorStore abstraction currently exposes delete + upsert rather
     * than an atomic replace operation, so this remains the generic
     * implementation.
     */
    await this.vectorStore.deleteByDocument(document.id);

    this.throwIfAborted(options.signal);

    if (records.length > 0) {
      await this.vectorStore.upsert(records);
    }

    this.throwIfAborted(options.signal);

    /**
     * Keep the canonical context representation available for metadata
     * inspection and direct context lookup.
     */
    this.documents.set(document.id, document);

    return {
      document,

      chunks,
    };
  }

  /**
   * Removes a document from both the vector index and the
   * in-memory context registry.
   */
  public async removeDocument(documentId: string): Promise<void> {
    const normalizedDocumentId = documentId?.trim();

    if (!normalizedDocumentId) {
      throw new Error("A document ID is required.");
    }

    await this.vectorStore.deleteByDocument(normalizedDocumentId);

    this.documents.delete(normalizedDocumentId);
  }

  /**
   * Retrieves, ranks and compresses context.
   */
  public async query(request: ContextQuery): Promise<ContextResult> {
    if (!request) {
      throw new Error("A context query request is required.");
    }

    const query = request.query.trim();

    if (!query) {
      return {
        query: "",

        retrieved: [],

        contexts: [],

        compressed: this.compressor.compress([]),
      };
    }

    const retrieved = await this.retriever.retrieve(query, {
      limit: request.limit,

      minScore: request.minScore,

      documentIds: request.documentIds,

      documentTypes: request.documentTypes,

      candidateId: request.candidateId,
    });

    const ranked = this.ranker.rank(retrieved);

    const compressed = this.compressor.compress(ranked);

    return {
      query,

      retrieved,

      contexts: ranked,

      compressed,
    };
  }

  public getDocument(documentId: string): ParsedDocument | undefined {
    const normalizedDocumentId = documentId?.trim();

    if (!normalizedDocumentId) {
      return undefined;
    }

    return this.documents.get(normalizedDocumentId);
  }

  public getDocuments(): readonly ParsedDocument[] {
    return Array.from(this.documents.values());
  }

  public async clear(): Promise<void> {
    await this.vectorStore.clear();

    this.documents.clear();
  }

  public async getIndexedChunkCount(): Promise<number> {
    return this.vectorStore.count();
  }

  private validatePreparedDocument(document: ParsedDocument): void {
    if (!document) {
      throw new Error("A prepared context document is required.");
    }

    if (typeof document.id !== "string" || !document.id.trim()) {
      throw new Error("A prepared context document must have a non-empty ID.");
    }

    if (typeof document.name !== "string" || !document.name.trim()) {
      throw new Error(
        `Prepared context document "${document.id}" must have a name.`,
      );
    }

    if (typeof document.text !== "string") {
      throw new Error(
        `Prepared context document "${document.id}" must contain text.`,
      );
    }

    if (!document.text.trim()) {
      throw new Error(
        `Prepared context document "${document.id}" contains no usable text.`,
      );
    }

    if (typeof document.type !== "string" || !document.type.trim()) {
      throw new Error(
        `Prepared context document "${document.id}" must have a type.`,
      );
    }

    if (
      typeof document.sourceType !== "string" ||
      !document.sourceType.trim()
    ) {
      throw new Error(
        `Prepared context document "${document.id}" must have a source type.`,
      );
    }
  }

  private validatePreparedChunks(
    document: ParsedDocument,
    chunks: readonly Chunk[],
  ): void {
    if (!Array.isArray(chunks)) {
      throw new Error(
        `Prepared chunks for document "${document.id}" must be an array.`,
      );
    }

    const seenIds = new Set<string>();

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];

      if (!chunk) {
        throw new Error(
          `Prepared context document "${document.id}" contains an invalid chunk at index ${index}.`,
        );
      }

      if (typeof chunk.id !== "string" || !chunk.id.trim()) {
        throw new Error(
          `Prepared context document "${document.id}" contains a chunk without an ID.`,
        );
      }

      if (
        typeof chunk.contextId !== "string" ||
        chunk.contextId !== document.id
      ) {
        throw new Error(
          `Prepared context chunk "${chunk.id}" has contextId "${chunk.contextId}", ` +
            `expected "${document.id}".`,
        );
      }

      if (chunk.documentId !== undefined && chunk.documentId !== document.id) {
        throw new Error(
          `Prepared context chunk "${chunk.id}" belongs to document "${chunk.documentId}", ` +
            `expected "${document.id}".`,
        );
      }

      if (typeof chunk.text !== "string" || !chunk.text.trim()) {
        throw new Error(
          `Prepared context chunk "${chunk.id}" contains no usable text.`,
        );
      }

      if (seenIds.has(chunk.id)) {
        throw new Error(
          `Prepared context document "${document.id}" contains duplicate chunk ID "${chunk.id}".`,
        );
      }

      seenIds.add(chunk.id);
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Context indexing was cancelled.");
  }
}
