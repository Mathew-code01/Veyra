
import type { ConversationAnalysis } from "../../../shared/types/conversation";
import type {
  InterviewClassification,
  InterviewTask,
} from "../../../shared/types/interviews";
import type { InterviewTaskEngine } from "../contracts/InterviewTaskEngine";

export class MotivationEngine implements InterviewTaskEngine {
  public readonly type = "motivation" as const;

  public canHandle(
    classification: InterviewClassification,
  ): boolean {
    return classification.type === this.type;
  }

  public buildTask(
    analysis: ConversationAnalysis,
    classification: InterviewClassification,
  ): InterviewTask | undefined {
    if (!this.canHandle(classification) || !analysis.question.isQuestion) {
      return undefined;
    }

    return {
      id: `interview-task:${analysis.turn.id}`,
      type: this.type,
      questionText: analysis.turn.text.trim(),
      requiresResponse: analysis.question.requiresResponse,
      confidence: classification.confidence,
      conversationTurnId: analysis.turn.id,
      segmentId: analysis.turn.segmentId,
    };
  }
}
