// shared/types/ai.ts

import type { UUID } from "./common";

/**
 * AI providers supported by Veyra.
 *
 * This is the canonical AIProvider definition.
 */
export const AI_PROVIDERS = ["gemini", "ollama", "mock"] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];

/**
 * High-level AI request modes.
 */
export const AI_REQUEST_MODES = [
  "behavioral",
  "technical",
  "coding",
  "system-design",
  "product",
  "case",
  "communication",
  "general",
] as const;

export type AIRequestMode = (typeof AI_REQUEST_MODES)[number];

/**
 * Supported message roles.
 */
export type AIMessageRole = "system" | "user" | "assistant";

/**
 * A single message sent to an AI provider.
 */
export interface AIMessage {
  readonly role: AIMessageRole;
  readonly content: string;
}

/**
 * Provider request metadata.
 *
 * Metadata must remain string-based because it can safely cross
 * Electron IPC, HTTP, logging and serialization boundaries.
 */
export type AIMetadata = Readonly<Record<string, string>>;

/**
 * Standard AI request shared across client, desktop, server and core.
 */
export interface AIRequest {
  readonly requestId: UUID;

  readonly provider?: AIProvider;

  readonly model?: string;

  readonly mode: AIRequestMode;

  readonly messages: readonly AIMessage[];

  readonly temperature?: number;

  readonly maxTokens?: number;

  readonly stream?: boolean;

  readonly metadata?: AIMetadata;
}

/**
 * Standard token usage information.
 */
export interface AIUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/**
 * Standard AI completion finish reason.
 */
export type AIFinishReason = "stop" | "length" | "error" | "unknown";

/**
 * Standard AI response.
 */
export interface AIResponse {
  readonly requestId: UUID;

  readonly provider: AIProvider;

  readonly model: string;

  readonly content: string;

  readonly finishReason: AIFinishReason;

  readonly usage?: AIUsage;

  readonly latencyMs: number;
}

/**
 * Streaming response chunk.
 */
export interface AIStreamChunk {
  readonly requestId: UUID;

  readonly delta: string;

  readonly done: boolean;

  readonly finishReason?: AIFinishReason;

  readonly usage?: AIUsage;
}

/**
 * Streaming session state.
 */
export type AIStreamStatus =
  "created" | "starting" | "streaming" | "completed" | "cancelled" | "failed";

/**
 * AI streaming session.
 */
export interface AIStreamStart {
  readonly streamId: UUID;

  readonly requestId: UUID;

  readonly provider: AIProvider;

  readonly model: string;

  readonly status: AIStreamStatus;

  readonly startedAt: string;
}

/**
 * Provider health state.
 */
export type AIHealthState = "healthy" | "degraded" | "unavailable" | "unknown";

/**
 * Provider health information.
 */
export interface AIHealthStatus {
  readonly provider: AIProvider;

  readonly state: AIHealthState;

  readonly model?: string;

  readonly checkedAt: string;

  readonly latencyMs?: number;

  readonly errorMessage?: string;

  readonly retryAfterMs?: number;
}

/**
 * Provider capability information.
 */
export interface AIProviderCapabilities {
  readonly text: boolean;
  readonly streaming: boolean;
  readonly vision: boolean;
  readonly embeddings: boolean;
}

/**
 * Complete provider status.
 */
export interface AIProviderStatus {
  readonly provider: AIProvider;

  readonly health: AIHealthStatus;

  readonly capabilities: AIProviderCapabilities;

  readonly models: readonly string[];
}

/**
 * Runtime helper.
 */
export function isAIProvider(value: unknown): value is AIProvider {
  return (
    typeof value === "string" &&
    (AI_PROVIDERS as readonly string[]).includes(value)
  );
}
