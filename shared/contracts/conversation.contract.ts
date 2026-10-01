// ============================================================================
// FILE: shared/contracts/conversation.contract.ts
// PURPOSE:
// Stable application boundary for the conversation subsystem.
//
// Implementation:
//     core/conversation
//
// Consumers:
//     desktop
//     client
//     server
//     orchestration layers
// ============================================================================

import type {
  ConversationAnalysis,
  ConversationMemorySnapshot,
  TranscriptSegment,
} from "../types/conversation";

import type { UUID } from "../types/common";

// ============================================================================
// ANALYSIS
// ============================================================================

export interface ConversationAnalysisRequest {
  readonly segment: TranscriptSegment;

  readonly signal?: AbortSignal;
}

export interface ConversationAnalysisResponse {
  readonly analysis: ConversationAnalysis;
}

// ============================================================================
// STATE
// ============================================================================

export interface ConversationStateRequest {
  readonly sessionId: UUID;
}

export interface ConversationStateResponse {
  readonly state: ConversationMemorySnapshot;
}

// ============================================================================
// SERVICE CONTRACT
// ============================================================================

/**
 * Stable async boundary.
 *
 * The internal conversation engine may remain synchronous because its
 * current analysis pipeline is CPU-local and deterministic.
 *
 * This adapter provides the async application boundary required by
 * desktop/client/server orchestration.
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
