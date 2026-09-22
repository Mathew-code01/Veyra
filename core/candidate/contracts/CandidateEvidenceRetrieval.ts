// ============================================================================
// FILE: core/candidate/contracts/CandidateEvidenceRetrieval.ts
// PURPOSE:
// Retrieval port for candidate evidence.
//
// IMPORTANT:
// This is intentionally an abstraction/port.
//
// The Candidate domain does NOT know how retrieval is implemented.
// Candidate-5 can later connect this port to:
//   - core/context
//   - embeddings
//   - SQLite indexes
//   - lexical search
//   - semantic retrieval
//   - hybrid retrieval
//
// This keeps Candidate-1 independent from the rest of Veyra.
// ============================================================================

import type {
  CandidateEvidence,
  CandidateEvidenceType,
} from "./CandidateEvidence";

import type { CandidateId } from "./CandidateTypes";

/**
 * Query used to retrieve evidence belonging to one candidate.
 */
export interface CandidateEvidenceQuery {
  readonly candidateId: CandidateId;

  /**
   * Natural-language question or information need.
   */
  readonly question: string;

  /**
   * Maximum number of evidence records to return.
   */
  readonly limit?: number;

  /**
   * Minimum relevance score accepted by the retrieval implementation.
   *
   * Expected range: 0..1.
   */
  readonly minScore?: number;

  /**
   * Optional cancellation signal for long-running retrieval.
   */
  readonly signal?: AbortSignal;
}

/**
 * Raw evidence item returned by the retrieval implementation.
 *
 * The retrieval implementation is responsible for identifying the correct
 * evidence type. It must never silently relabel unknown evidence as another
 * type because provenance matters.
 */
export interface CandidateEvidenceSourceItem {
  readonly id: string;
  readonly candidateId: CandidateId;

  readonly type: CandidateEvidenceType;

  readonly text: string;

  /**
   * Relevance score assigned by the retrieval system.
   *
   * Expected range: 0..1.
   */
  readonly score: number;

  readonly sourceId?: string;
  readonly sourceName?: string;

  /**
   * Whether the underlying evidence has been explicitly verified.
   */
  readonly verified: boolean;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Result returned by the retrieval implementation.
 */
export interface CandidateEvidenceSourceResult {
  readonly items: readonly CandidateEvidenceSourceItem[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Candidate-domain retrieval port.
 *
 * Candidate services depend on this interface, not on ContextManager or any
 * concrete retrieval implementation.
 */
export interface CandidateEvidenceRetrievalPort {
  retrieve(
    request: CandidateEvidenceQuery,
  ): Promise<CandidateEvidenceSourceResult>;
}

/**
 * Final normalized result exposed by CandidateEvidenceRetriever.
 */
export interface CandidateEvidenceResult {
  readonly candidateId: CandidateId;

  readonly question: string;

  readonly evidence: readonly CandidateEvidence[];

  readonly metadata?: Readonly<Record<string, unknown>>;
}
