// ============================================================================
// FILE: shared/contracts/interview.contract.ts
//
// PURPOSE:
// Public cross-boundary contract for core/interview.
//
// The implementation lives in:
//     core/interview/services/InterviewEngine.ts
//
// ============================================================================

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
} from "../types/interviews";

export interface InterviewAnalysisResponse {
  readonly analysis: InterviewAnalysis;
}

/**
 * Cross-boundary Interview service.
 */
export interface InterviewServiceContract {
  analyze(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewAnalysisResponse>;
}
