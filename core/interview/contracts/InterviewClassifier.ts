
// ============================================================================
// FILE: core/interview/contracts/InterviewClassifier.ts
//
// PURPOSE:
// Internal Interview classification contract.
// ============================================================================

import type {
  InterviewClassification,
} from "../../../shared/types/interviews";

import type { ConversationAnalysis } from "../../../shared/types/conversation";

export interface InterviewClassifier {
  classify(
    analysis: ConversationAnalysis,
  ): InterviewClassification;
}
