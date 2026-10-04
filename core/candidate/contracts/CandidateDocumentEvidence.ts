// ============================================================================
// FILE: core/candidate/contracts/CandidateDocumentEvidence.ts
// PURPOSE:
// Candidate-owned ingestion port for evidence derived from Documents.
//
// Documents produce analysis. Candidate decides how that analysis becomes
// candidate evidence. This prevents DocumentService from depending on
// Candidate stores or Candidate internals.
// ============================================================================

import type { DocumentAnalysisInput } from "../../../shared/validation/documentSchemas";

import type { CandidateEvidence } from "./CandidateEvidence";

import type { CandidateId } from "./CandidateTypes";

export interface CandidateDocumentEvidenceIngestRequest {
  readonly candidateId: CandidateId;

  readonly analysis: DocumentAnalysisInput;

  readonly signal?: AbortSignal;
}

export interface CandidateDocumentEvidenceIngestResult {
  readonly candidateId: CandidateId;

  readonly documentId: string;

  readonly analysisId: string;

  readonly evidence: readonly CandidateEvidence[];
}

export interface CandidateDocumentEvidencePort {
  ingest(
    request: CandidateDocumentEvidenceIngestRequest,
  ): Promise<CandidateDocumentEvidenceIngestResult>;
}
