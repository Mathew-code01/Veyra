// ============================================================================
// FILE: core/ai/AIResponse.ts
// PURPOSE:
// Core AI response compatibility layer.
//
// Canonical response contracts live in:
//   shared/types/ai.ts
//
// No second AIResponse contract is maintained here.
// ============================================================================

export type {
  AIUsage,
  AIResponseMetadata,
  AITextResponse,
  AITextResponseType,
  AIEmbeddingResponse,
  AIResponse,
  AIStreamChunk,
  AIFinishReason,
} from "../../shared/types/ai";

export {
  isAITextResponse,
  isAIEmbeddingResponse,
  isAIResponse,
} from "../../shared/types/ai";
