import type {
  ConversationAnalysis,
  ConversationTurn,
  TranscriptSegment,
} from "../../../shared/types/conversation";

export interface ConversationAnalyzerInput {
  readonly segment: TranscriptSegment;
  readonly previousQuestion?: ConversationTurn;
  readonly previousTopic?: ConversationAnalysis["topic"];
  readonly previousQuestions: readonly ConversationTurn[];
  readonly signal?: AbortSignal;
}

export interface ConversationAnalyzerContract {
  analyze(input: ConversationAnalyzerInput): ConversationAnalysis;
}
