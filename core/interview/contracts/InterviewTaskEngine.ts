
// ============================================================================
// FILE: core/interview/contracts/InterviewTaskEngine.ts
//
// PURPOSE:
// Contract implemented by each interview-specific engine.
// ============================================================================

import type {
  InterviewClassification,
  InterviewTask,
} from "../../../shared/types/interviews";

import type { ConversationAnalysis } from "../../../shared/types/conversation";

export interface InterviewTaskEngine {
  readonly type: InterviewClassification["type"];

  canHandle(
    classification: InterviewClassification,
  ): boolean;

  buildTask(
    analysis: ConversationAnalysis,
    classification: InterviewClassification,
  ): InterviewTask | undefined;
}
