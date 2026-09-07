// core/ai/AIResponse.ts

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIResponseMetadata {
  provider: string;
  model: string;
  requestId: string;
  latencyMs: number;
  finishReason?: string;
  usage?: AIUsage;
  cached?: boolean;
}

export interface AIResponse {
  text: string;
  metadata: AIResponseMetadata;
}

export interface AIStreamChunk {
  text: string;
  requestId: string;
  provider: string;
  model: string;
  done: boolean;
  finishReason?: string;
}