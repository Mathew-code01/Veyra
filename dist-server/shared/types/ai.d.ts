export type AIProvider = "gemini" | "ollama" | "mock";
export type AIRequestMode = "behavioral" | "technical" | "coding" | "system-design" | "product" | "case" | "general";
export interface AIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface AIRequest {
    requestId: string;
    provider?: AIProvider;
    mode: AIRequestMode;
    messages: AIMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    metadata?: Record<string, string>;
}
export interface AIUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
export interface AIResponse {
    requestId: string;
    provider: AIProvider;
    model: string;
    content: string;
    finishReason: "stop" | "length" | "error" | "unknown";
    usage?: AIUsage;
    latencyMs: number;
}
export interface AIStreamChunk {
    requestId: string;
    delta: string;
    done: boolean;
    finishReason?: AIResponse["finishReason"];
}
