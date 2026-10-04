// ============================================================================
// FILE: core/candidate/contracts/CandidateDocumentEvidence.ts
//
// PURPOSE:
// Candidate-owned ingestion port for evidence derived from Documents.
//
// ARCHITECTURE:
//
//   DocumentService
//        |
//        | DocumentAnalysis
//        v
//   CandidateDocumentEvidencePort
//        |
//        v
//   CandidateDocumentEvidenceAdapter
//        |
//        v
//   CandidateEvidenceStore
//
// IMPORTANT:
//
// Candidate owns the decision of how document-derived facts become
// CandidateEvidence.
//
// DocumentService MUST NOT:
// - write to CandidateEvidenceStore directly
// - modify CandidateProfile
// - modify CandidateExperience
// - modify CandidateProject
// - modify CandidateSkill
// - modify CandidateStory
// - know CandidateContextBuilder
// - know CandidateService
//
// This port is intentionally Candidate-owned so Candidate remains the
// authoritative owner of candidate evidence.
// ============================================================================

import type { DocumentAnalysis } from "../../../shared/types/documents";

import type { CandidateEvidence } from "./CandidateEvidence";

import type { CandidateId } from "./CandidateTypes";

// ============================================================================
// REQUEST
// ============================================================================

export interface CandidateDocumentEvidenceIngestRequest {
  /**
   * Candidate that owns the document-derived evidence.
   */
  readonly candidateId: CandidateId;

  /**
   * Canonical semantic analysis produced by the Document subsystem.
   *
   * This is a derived artifact of the original document.
   *
   * Candidate does not receive the raw document here.
   */
  readonly analysis: DocumentAnalysis;

  /**
   * Shared cancellation signal propagated from the document workflow.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// RESULT
// ============================================================================

export interface CandidateDocumentEvidenceIngestResult {
  /**
   * Candidate that received the evidence.
   */
  readonly candidateId: CandidateId;

  /**
   * Original source document.
   */
  readonly documentId: string;

  /**
   * Semantic analysis execution that produced the evidence.
   */
  readonly analysisId: string;

  /**
   * Candidate evidence created or updated from the analysis.
   */
  readonly evidence: readonly CandidateEvidence[];
}

// ============================================================================
// PORT
// ============================================================================

/**
 * Candidate-owned document evidence ingestion boundary.
 *
 * Documents depend only on this abstraction when they need to publish
 * semantic analysis into Candidate.
 *
 * The concrete implementation belongs to Candidate.
 */
export interface CandidateDocumentEvidencePort {
  ingest(
    request: CandidateDocumentEvidenceIngestRequest,
  ): Promise<CandidateDocumentEvidenceIngestResult>;
}
