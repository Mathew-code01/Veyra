// ============================================================================
// FILE: core/context/ContextManager.ts
//
// PURPOSE:
// Central orchestration service for the generic Veyra Context subsystem.
//
// CONTEXT ANSWERS:
//
//     "What information should Veyra know right now?"
//
// POSSIBLE SOURCES:
// - documents
// - vision
// - audio
// - conversation
// - candidate
// - memories
// - web
// - tools
// - generated content
// - application state
// - future sources
//
// ARCHITECTURAL RULE:
//
//     source domain
//          ↓
//     shared contract / adapter
//          ↓
//     ContextManager
//          ↓
//     embeddings
//          ↓
//     vector storage
//          ↓
//     retrieval/ranking/compression
//
// core/context MUST NOT import source-domain implementations.
// ============================================================================

import type {
  ContextInput,
  ContextItem,
  PreparedContext,
} from "./contracts/contextTypes";

import type {
  ContextQuery,
  RetrievedContext,
  RankedContext,
  CompressedContext,
} from "./contracts/ContextQuery";

import type { Chunk, Chunker } from "./ingestion/Chunker";

import type { ContextParser } from "./ingestion/ContextParser";

import type { EmbeddingService } from "./embeddings/EmbeddingService";

import type {
  ContextStore,
  ContextVectorRecord,
} from "./contracts/ContextStore";

import type { Retriever } from "./retrieval/Retriever";

import type { ContextRanker } from "./retrieval/ContextRanker";

import type { ContextCompressor } from "./retrieval/ContextCompressor";

// ============================================================================
// OPTIONS
// ============================================================================

export interface ContextManagerOptions {
  readonly parser: ContextParser;

  readonly chunker: Chunker;

  readonly embeddings: EmbeddingService;

  readonly vectorStore: ContextStore;

  readonly retriever: Retriever;

  readonly ranker: ContextRanker;

  readonly compressor: ContextCompressor;
}

// ============================================================================
// INDEX OPTIONS
// ============================================================================

export interface ContextIndexOptions {
  readonly signal?: AbortSignal;
}

// ============================================================================
// RESULT
// ============================================================================

export interface ContextIndexResult extends PreparedContext {}

// ============================================================================
// QUERY RESULT
// ============================================================================

export interface ContextQueryResult {
  readonly query: string;

  readonly retrieved: readonly RetrievedContext[];

  readonly contexts: readonly RankedContext[];

  readonly compressed: CompressedContext;
}

// ============================================================================
// MANAGER
// ============================================================================

export class ContextManager {
  private readonly parser: ContextParser;

  private readonly chunker: Chunker;

  private readonly embeddings: EmbeddingService;

  private readonly vectorStore: ContextStore;

  private readonly retriever: Retriever;

  private readonly ranker: ContextRanker;

  private readonly compressor: ContextCompressor;

  /**
   * In-memory registry of canonical Context items.
   *
   * This registry is deliberately generic.
   *
   * A future persistent ContextRepository can replace this without changing
   * the Context ingestion/retrieval contracts.
   */
  private readonly contexts = new Map<string, ContextItem>();

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

  // ==========================================================================
  // GENERIC INGESTION
  // ==========================================================================

  /**
   * Generic Context ingestion path.
   *
   * Use this when the caller provides text and wants Context to perform
   * generic parsing/chunking.
   */
  public async index(
    input: ContextInput,
    options: ContextIndexOptions = {},
  ): Promise<ContextIndexResult> {
    this.throwIfAborted(options.signal);

    const context = this.parser.parse(input);

    this.throwIfAborted(options.signal);

    const chunks = this.chunker.chunk(
      context.id,
      context.text,
      {
        ...context.metadata,

        sourceType: context.source.type,

        sourceId: context.source.id,

        sourceName: context.source.name,

        contentType: context.contentType,

        scope: context.scope,
      },
      {
        signal: options.signal,
      },
    );

    this.throwIfAborted(options.signal);

    return this.indexPreparedContext(context, chunks, options);
  }

  // ==========================================================================
  // PREPARED INGESTION
  // ==========================================================================

  /**
   * Prepared Context ingestion path.
   *
   * This is the important boundary used by source-specific adapters.
   *
   * Example:
   *
   *     core/documents
   *          ↓
   *     ContextDocumentIndexer
   *          ↓
   *     indexPreparedContext()
   *
   * Documents have already parsed/normalized/chunked their data.
   *
   * Therefore this method DOES NOT:
   *
   *     parse
   *     normalize
   *     rechunk
   *
   * It only performs:
   *
   *     prepared chunks
   *          ↓
   *     embeddings
   *          ↓
   *     Context vector records
   *          ↓
   *     storage
   */
  public async indexPreparedContext(
    context: ContextItem,
    chunks: readonly Chunk[],
    options: ContextIndexOptions = {},
  ): Promise<ContextIndexResult> {
    this.validateContext(context);

    this.validatePreparedChunks(context, chunks);

    this.throwIfAborted(options.signal);

    const embeddingResult =
      chunks.length > 0
        ? await this.embeddings.embed(
            chunks.map((chunk) => chunk.text),
            {
              signal: options.signal,
            },
          )
        : {
            embeddings: [],
          };

    this.throwIfAborted(options.signal);

    if (embeddingResult.embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch for context "${context.id}". ` +
          `Expected ${chunks.length}, received ${embeddingResult.embeddings.length}.`,
      );
    }

    const records: ContextVectorRecord[] = [];

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

        contextId: context.id,

        text: chunk.text,

        vector,

        sourceType: context.source.type,

        sourceId: context.source.id,

        sourceName: context.source.name ?? context.name,

        contentType: context.contentType,

        scope: context.scope,

        metadata: {
          ...context.metadata,

          ...chunk.metadata,

          contextId: context.id,

          sourceType: context.source.type,

          sourceId: context.source.id,

          sourceName: context.source.name ?? context.name,

          contentType: context.contentType,

          embeddingModel: embeddingResult.model,

          embeddingDimensions: embeddingResult.dimensions,
        },
      });
    }

    this.throwIfAborted(options.signal);

    /**
     * Embeddings are generated BEFORE the previous representation is removed.
     *
     * This avoids destroying an existing searchable representation when
     * embedding generation fails.
     */
    await this.vectorStore.deleteByContext(context.id);

    this.throwIfAborted(options.signal);

    if (records.length > 0) {
      await this.vectorStore.upsert(records);
    }

    this.throwIfAborted(options.signal);

    this.contexts.set(context.id, context);

    return {
      context,

      chunks,
    };
  }

  // ==========================================================================
  // REMOVAL
  // ==========================================================================

  /**
   * Remove a Context item and all associated vector records.
   */
  public async remove(
    contextId: string,
    options: ContextIndexOptions = {},
  ): Promise<void> {
    const normalized = contextId?.trim();

    if (!normalized) {
      throw new Error("A context ID is required.");
    }

    this.throwIfAborted(options.signal);

    await this.vectorStore.deleteByContext(normalized);

    this.throwIfAborted(options.signal);

    this.contexts.delete(normalized);
  }

  // ==========================================================================
  // QUERY
  // ==========================================================================

  /**
   * Retrieve, rank and compress generic Context.
   */
  public async query(request: ContextQuery): Promise<ContextQueryResult> {
    if (!request) {
      throw new Error("A context query request is required.");
    }

    const query = request.query?.trim();

    if (!query) {
      return {
        query: "",

        retrieved: [],

        contexts: [],

        compressed: this.compressor.compress([]),
      };
    }

    this.throwIfAborted(request.signal);

    const retrieved = await this.retriever.retrieve(query, {
      limit: request.limit,

      minScore: request.minScore,

      sourceTypes: request.sourceTypes,

      contentTypes: request.contentTypes,

      sourceIds: request.sourceIds,

      scope: request.scope,

      metadata: request.metadata,

      signal: request.signal,
    });

    this.throwIfAborted(request.signal);

    const ranked = this.ranker.rank(retrieved);

    const compressed = this.compressor.compress(ranked);

    return {
      query,

      retrieved,

      contexts: ranked,

      compressed,
    };
  }

  // ==========================================================================
  // LOOKUPS
  // ==========================================================================

  public get(contextId: string): ContextItem | undefined {
    const normalized = contextId?.trim();

    if (!normalized) {
      return undefined;
    }

    return this.contexts.get(normalized);
  }

  public getAll(): readonly ContextItem[] {
    return Array.from(this.contexts.values());
  }

  public async clear(): Promise<void> {
    await this.vectorStore.clear();

    this.contexts.clear();
  }

  public async getIndexedChunkCount(): Promise<number> {
    return this.vectorStore.count();
  }

  public async getContextCount(): Promise<number> {
    return this.contexts.size;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  private validateContext(context: ContextItem): void {
    if (!context) {
      throw new Error("A Context item is required.");
    }

    if (typeof context.id !== "string" || !context.id.trim()) {
      throw new Error("Context must have a non-empty ID.");
    }

    if (typeof context.name !== "string" || !context.name.trim()) {
      throw new Error(`Context "${context.id}" must have a non-empty name.`);
    }

    if (
      typeof context.contentType !== "string" ||
      !context.contentType.trim()
    ) {
      throw new Error(`Context "${context.id}" must have a content type.`);
    }

    if (!context.source || typeof context.source !== "object") {
      throw new Error(`Context "${context.id}" must have source provenance.`);
    }

    if (
      typeof context.source.type !== "string" ||
      !context.source.type.trim()
    ) {
      throw new Error(`Context "${context.id}" must have a source type.`);
    }

    if (typeof context.text !== "string") {
      throw new Error(`Context "${context.id}" must contain text.`);
    }

    if (!context.text.trim()) {
      throw new Error(`Context "${context.id}" contains no usable text.`);
    }
  }

  private validatePreparedChunks(
    context: ContextItem,
    chunks: readonly Chunk[],
  ): void {
    if (!Array.isArray(chunks)) {
      throw new Error(
        `Prepared chunks for context "${context.id}" must be an array.`,
      );
    }

    const seenIds = new Set<string>();

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];

      if (!chunk) {
        throw new Error(
          `Context "${context.id}" contains an invalid chunk at index ${index}.`,
        );
      }

      if (typeof chunk.id !== "string" || !chunk.id.trim()) {
        throw new Error(
          `Context "${context.id}" contains a chunk without an ID.`,
        );
      }

      if (chunk.contextId !== context.id) {
        throw new Error(
          `Context chunk "${chunk.id}" has contextId "${chunk.contextId}", ` +
            `expected "${context.id}".`,
        );
      }

      if (typeof chunk.text !== "string" || !chunk.text.trim()) {
        throw new Error(`Context chunk "${chunk.id}" contains no usable text.`);
      }

      if (seenIds.has(chunk.id)) {
        throw new Error(
          `Context "${context.id}" contains duplicate chunk ID "${chunk.id}".`,
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
      : new Error("Context operation was cancelled.");
  }
}
