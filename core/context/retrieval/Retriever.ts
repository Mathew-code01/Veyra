// ============================================================================
// FILE: core/context/retrieval/Retriever.ts
//
// PURPOSE:
// Generic semantic Context retrieval.
//
// This layer knows about:
// - embeddings
// - vector storage
// - generic Context filtering
//
// It does NOT know about:
// - Documents
// - Vision
// - Audio
// - Candidate
// - Conversation
// - Interview
// ============================================================================

import type { ContextQuery, RetrievedContext } from "../contracts/ContextQuery";

import type { ContextStore } from "../contracts/ContextStore";

import type { EmbeddingService } from "../embeddings/EmbeddingService";

// ============================================================================
// OPTIONS
// ============================================================================

export interface RetrievalOptions {
  readonly limit?: number;

  readonly minScore?: number;

  readonly sourceTypes?: ContextQuery["sourceTypes"];

  readonly contentTypes?: ContextQuery["contentTypes"];

  readonly sourceIds?: ContextQuery["sourceIds"];

  readonly scope?: ContextQuery["scope"];

  readonly metadata?: ContextQuery["metadata"];

  readonly signal?: AbortSignal;
}

// ============================================================================
// CONTRACT
// ============================================================================

export interface Retriever {
  retrieve(
    query: string,
    options?: RetrievalOptions,
  ): Promise<readonly RetrievedContext[]>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class SemanticRetriever implements Retriever {
  private readonly embeddings: EmbeddingService;

  private readonly vectorStore: ContextStore;

  public constructor(embeddings: EmbeddingService, vectorStore: ContextStore) {
    if (!embeddings) {
      throw new Error("SemanticRetriever requires an embedding service.");
    }

    if (!vectorStore) {
      throw new Error("SemanticRetriever requires a ContextStore.");
    }

    this.embeddings = embeddings;

    this.vectorStore = vectorStore;
  }

  public async retrieve(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<readonly RetrievedContext[]> {
    const normalized = query?.trim();

    if (!normalized) {
      return [];
    }

    const limit = normalizeLimit(options.limit);

    const minScore = normalizeMinScore(options.minScore);

    this.throwIfAborted(options.signal);

    const embedding = await this.embeddings.embedOne(normalized, {
      signal: options.signal,
    });

    this.throwIfAborted(options.signal);

    const results = await this.vectorStore.search(embedding, {
      limit,

      minScore,

      sourceTypes: options.sourceTypes,

      contentTypes: options.contentTypes,

      sourceIds: options.sourceIds,

      scope: options.scope,

      metadata: options.metadata,

      signal: options.signal,
    });

    this.throwIfAborted(options.signal);

    return results.map(({ record, score }) => ({
      id: record.id,

      contextId: record.contextId,

      text: record.text,

      score,

      source: {
        type: record.sourceType,

        id: record.sourceId,

        name: record.sourceName,
      },

      contentType: record.contentType,

      scope: record.scope,

      metadata: record.metadata,
    }));
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Context retrieval was cancelled.");
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) {
    return 8;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "Context retrieval limit must be a positive safe integer.",
    );
  }

  return Math.min(value, 100);
}

function normalizeMinScore(value: number | undefined): number {
  if (value === undefined) {
    return -1;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError("Context minimum score must be a finite number.");
  }

  return value;
}
