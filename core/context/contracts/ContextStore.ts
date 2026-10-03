// ============================================================================
// FILE: core/context/contracts/ContextStore.ts
//
// PURPOSE:
// Storage contract for generic Context records.
//
// The storage layer does not know about Documents, Vision, Audio,
// Candidate, Conversation or Interview implementations.
//
// It stores generic Context information and provenance.
// ============================================================================

import type {
  ContextContentType,
  ContextScope,
  ContextSourceType,
} from "./ContextTypes";

// ============================================================================
// VECTOR RECORD
// ============================================================================

export interface ContextVectorRecord {
  readonly id: string;

  /**
   * Parent Context identity.
   */
  readonly contextId: string;

  /**
   * Text represented by this vector.
   */
  readonly text: string;

  /**
   * Vector embedding.
   */
  readonly vector: readonly number[];

  /**
   * Source provenance.
   */
  readonly sourceType: ContextSourceType;

  readonly sourceId?: string;

  readonly sourceName?: string;

  /**
   * Semantic content type.
   */
  readonly contentType: ContextContentType;

  /**
   * Optional retrieval scope.
   */
  readonly scope?: ContextScope;

  /**
   * Arbitrary metadata.
   */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ============================================================================
// SEARCH
// ============================================================================

export interface ContextVectorSearchOptions {
  readonly limit: number;

  readonly minScore: number;

  readonly sourceTypes?: readonly ContextSourceType[];

  readonly contentTypes?: readonly ContextContentType[];

  readonly sourceIds?: readonly string[];

  readonly scope?: ContextScope;

  readonly metadata?: Readonly<Record<string, unknown>>;

  readonly signal?: AbortSignal;
}

export interface ContextVectorSearchResult {
  readonly record: ContextVectorRecord;

  readonly score: number;
}

// ============================================================================
// STORE
// ============================================================================

export interface ContextStore {
  upsert(records: readonly ContextVectorRecord[]): Promise<void>;

  /**
   * Remove every vector belonging to a Context item.
   */
  deleteByContext(contextId: string): Promise<void>;

  search(
    vector: readonly number[],
    options: ContextVectorSearchOptions,
  ): Promise<readonly ContextVectorSearchResult[]>;

  count(): Promise<number>;

  clear(): Promise<void>;
}
