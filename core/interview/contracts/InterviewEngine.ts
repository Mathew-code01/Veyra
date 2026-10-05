
// ============================================================================
// FILE: core/interview/contracts/InterviewEngine.ts
// ============================================================================

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
} from "../../../shared/types/interviews";

export interface InterviewEngineContract {
  analyze(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewAnalysis>;
}
