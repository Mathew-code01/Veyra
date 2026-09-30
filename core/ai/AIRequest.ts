// ============================================================================
// FILE: core/ai/AIRequest.ts
// PURPOSE:
// Core AI request compatibility layer.
//
// The canonical request contract lives in:
//   shared/types/ai.ts
//
// core/ai re-exports it so existing execution imports continue to work.
//
// This file intentionally contains no duplicate request interface.
// ============================================================================

export type {
  AIMessage,
  AIMessageRole,
  AIRequest,
  AIRequestOptions,
  AIVisionInput,
  AIResponseFormat,
} from "../../shared/types/ai";

import type { AIMessage, AIRequest } from "../../shared/types/ai";

/**
 * Create a new AI request.
 *
 * This helper remains in core/ai for backwards compatibility.
 */
export function createAIRequest(
  messages: readonly AIMessage[],
  options: Omit<AIRequest, "requestId" | "messages"> = {},
): AIRequest {
  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return Object.freeze({
    requestId,
    messages: Object.freeze([...messages]),
    ...options,
  });
}
