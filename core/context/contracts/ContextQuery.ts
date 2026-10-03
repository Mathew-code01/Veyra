// ============================================================================
// FILE: core/context/contracts/ContextQuery.ts
//
// PURPOSE:
// Generic retrieval/query contracts for core/context.
//
// This file must remain independent from:
// - core/documents
// - core/vision
// - core/audio
// - core/conversation
// - core/candidate
// - core/interview
// ============================================================================

import type {
  ContextContentType,
  ContextScope,
  ContextSourceType,
} from "./contextTypes";

// ============================================================================
// QUERY
// ============================================================================

export interface ContextQuery {
  /**
   * Natural-language retrieval query.
   */
  readonly query: string;

  /**
   * Maximum number of results.
   */
  readonly limit?: number;

  /**
   * Minimum semantic similarity score.
   */
  readonly minScore?: number;

  /**
   * Restrict by source type.
   */
  readonly sourceTypes?: readonly ContextSourceType[];

  /**
   * Restrict by semantic content type.
   */
  readonly contentTypes?: readonly ContextContentType[];

  /**
   * Restrict to specific source IDs.
   */
  readonly sourceIds?: readonly string[];

  /**
   * Restrict by generic scope.
   */
  readonly scope?: ContextScope;

  /**
   * Optional metadata filters.
   *
   * Implementations may support exact matching.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;

  /**
   * Optional cancellation.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// RETRIEVAL RESULT
// ============================================================================

export interface RetrievedContext {
  readonly id: string;

  readonly contextId: string;

  readonly text: string;

  readonly score: number;

  readonly source: {
    readonly type: ContextSourceType;

    readonly id?: string;

    readonly name?: string;
  };

  readonly contentType: ContextContentType;

  readonly scope?: ContextScope;

  readonly metadata: Readonly<Record<string, unknown>>;
}

// ============================================================================
// RANKING
// ============================================================================

export interface RankedContext extends RetrievedContext {
  /**
   * Final ranking score.
   */
  readonly rankScore: number;

  /**
   * Machine-readable ranking reasons.
   */
  readonly reasons: readonly string[];
}

// ============================================================================
// COMPRESSED CONTEXT
// ============================================================================

export interface CompressedContext {
  /**
   * Final text supplied to downstream AI/interview orchestration.
   */
  readonly text: string;

  /**
   * Number of ranked context records represented.
   */
  readonly sourceCount: number;

  /**
   * Approximate token count.
   */
  readonly tokenEstimate: number;

  /**
   * Ranked contexts used to produce the compressed result.
   */
  readonly contexts: readonly RankedContext[];
}
