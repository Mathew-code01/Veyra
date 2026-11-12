// shared/contracts/ai.contract.ts
// Canonical cross-boundary AI contracts for desktop IPC/server use.

import type {
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIStreamStart,
} from "../types/ai";
import type { Result, UUID } from "../types/common";

/** Non-streaming generation request (runtime-only `signal` must not cross IPC). */
export type AIGenerateRequest = Omit<AIRequest, "signal">;

/** Response returned from AI generation. */
export interface AIGenerateResponse {
  readonly response: AIResponse;
}

/** Request to start an AI streaming operation. */
export interface AIStreamStartRequest {
  readonly request: Omit<AIRequest, "signal">;
}

/** Response returned when an AI stream starts. */
export interface AIStreamStartResponse {
  readonly stream: AIStreamStart;
}

/** Individual streaming event payload. */
export interface AIStreamChunkEvent {
  readonly chunk: AIStreamChunk;
}

/** Request to cancel an active AI stream. */
export interface AICancelStreamRequest {
  readonly requestId: UUID;
  readonly reason?: string;
}

/** Request provider health information. */
export interface AIProviderStatusRequest {
  readonly forceRefresh?: boolean;
}

/** Provider health response. */
export interface AIProviderStatusResponse {
  readonly providers: readonly AIProviderHealth[];
}

/** Standard operation results. */
export type AIGenerateResult = Result<AIGenerateResponse>;
export type AIStreamStartResult = Result<AIStreamStartResponse>;
export type AIProviderStatusResult = Result<AIProviderStatusResponse>;
