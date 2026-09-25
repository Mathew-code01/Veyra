import type {
  ConversationAnalysis,
  ConversationMemorySnapshot,
  TranscriptSegment,
} from "../types/conversation";

/**
 * Request sent to the Conversation domain.
 */
export interface ConversationAnalysisRequest {
  readonly segment: TranscriptSegment;

  readonly signal?: AbortSignal;
}

/**
 * Response returned by the Conversation domain.
 */
export interface ConversationAnalysisResponse {
  readonly analysis: ConversationAnalysis;
}

/**
 * Current conversation state request.
 */
export interface ConversationStateRequest {
  readonly sessionId: string;
}

/**
 * Current conversation state response.
 */
export interface ConversationStateResponse {
  readonly state: ConversationMemorySnapshot;
}

/**
 * Cross-boundary Conversation service contract.
 *
 * The implementation lives in core/conversation.
 */
export interface ConversationServiceContract {
  analyze(
    request: ConversationAnalysisRequest,
  ): Promise<ConversationAnalysisResponse>;

  getState(
    request: ConversationStateRequest,
  ): Promise<ConversationStateResponse>;

  clear(request: ConversationStateRequest): Promise<void>;
}
