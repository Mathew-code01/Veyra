// shared/contracts/ai.contract.ts

import type {
  AIHealthStatus,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIStreamStart,
} from "../types/ai";

import type { Result, UUID } from "../types/common";

/**
 * Request for a non-streaming AI generation operation.
 *
 * AIRequest is already the complete request shape, so a type alias
 * is preferable to an empty extending interface.
 */
export type AIGenerateRequest = AIRequest;

/**
 * Response returned from AI generation.
 */
export interface AIGenerateResponse {
  readonly response: AIResponse;
}

/**
 * Request to start an AI streaming operation.
 */
export interface AIStreamStartRequest {
  readonly request: AIRequest;
}

/**
 * Response returned when an AI stream starts.
 */
export interface AIStreamStartResponse {
  readonly stream: AIStreamStart;
}

/**
 * Individual streaming event.
 */
export interface AIStreamChunkEvent {
  readonly chunk: AIStreamChunk;
}

/**
 * Request to cancel an active AI stream.
 */
export interface AICancelStreamRequest {
  readonly requestId: UUID;

  readonly reason?: string;
}

/**
 * Request provider health information.
 */
export interface AIProviderStatusRequest {
  readonly forceRefresh?: boolean;
}

/**
 * Provider health response.
 */
export interface AIProviderStatusResponse {
  readonly health: AIHealthStatus;
}

/**
 * Standard operation results.
 */
export type AIGenerateResult = Result<AIGenerateResponse>;

export type AIStreamStartResult = Result<AIStreamStartResponse>;

export type AIProviderStatusResult = Result<AIProviderStatusResponse>;
