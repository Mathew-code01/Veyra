import type { ConversationAnalysis } from "../types/conversation";

import type { InterviewAnalysis } from "../types/interviews";

export interface InterviewAnalysisRequest {
  readonly conversation: ConversationAnalysis;

  readonly signal?: AbortSignal;
}

export interface InterviewAnalysisResponse {
  readonly analysis: InterviewAnalysis;
}

/**
 * Cross-boundary contract exposed by core/interview.
 */
export interface InterviewServiceContract {
  analyze(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewAnalysisResponse>;
}
