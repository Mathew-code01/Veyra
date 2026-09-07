// core/ai/AIRequest.ts

export type AIMessageRole = "system" | "user" | "assistant";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface AIRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  responseFormat?: "text" | "json";
  metadata?: Record<string, string | number | boolean>;
}

export interface AIRequest {
  requestId: string;
  model?: string;
  messages: AIMessage[];
  options?: AIRequestOptions;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function createAIRequest(
  messages: AIMessage[],
  options?: Omit<AIRequest, "requestId" | "messages">,
): AIRequest {
  return {
    requestId: crypto.randomUUID(),
    messages,
    ...options,
  };
}
