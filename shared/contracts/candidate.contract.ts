import type { CandidateReference, CandidateSummary } from "../types/candidate";

export interface CandidateGetRequest {
  readonly candidateId: string;

  readonly signal?: AbortSignal;
}

export interface CandidateGetResponse {
  readonly candidate: CandidateSummary;
}

export interface CandidateReferenceResponse {
  readonly candidate: CandidateReference;
}

/**
 * Cross-boundary Candidate contract.
 *
 * The authoritative candidate implementation remains in
 * core/candidate.
 */
export interface CandidateServiceContract {
  getSummary(request: CandidateGetRequest): Promise<CandidateGetResponse>;
}
