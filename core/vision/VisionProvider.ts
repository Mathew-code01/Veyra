// core/vision/VisionProvider.ts

export type VisionDetailLevel = "low" | "medium" | "high";

export interface VisionImage {
  readonly data: Uint8Array;
  readonly mimeType: string;
}

export interface VisionRequest {
  readonly image: VisionImage;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly detail?: VisionDetailLevel;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly signal?: AbortSignal;
}

export interface VisionUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface VisionResponse {
  readonly text: string;
  readonly provider: string;
  readonly model?: string;
  readonly usage?: VisionUsage;
  readonly finishReason?: string;
  readonly durationMs: number;
}

export interface VisionProviderHealth {
  readonly provider: string;
  readonly status: "healthy" | "degraded" | "unavailable";
  readonly checkedAt: number;
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface VisionProvider {
  readonly name: string;

  analyze(request: VisionRequest): Promise<VisionResponse>;

  healthCheck(): Promise<VisionProviderHealth>;
}