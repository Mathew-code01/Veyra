import type { CloudAIService } from "./controlPlane.js";

export type InterviewCloudOperation =
  | "understand_question"
  | "plan_answer"
  | "evaluate_answer"
  | "domain_reasoning"
  | "structured_guidance";

export interface InterviewCloudGatewayRequest {
  readonly operation: InterviewCloudOperation;
  readonly sessionId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly externalProcessingConsent: boolean;
  readonly idempotencyKey: string;
}

export interface InterviewCloudGatewayResponse {
  readonly requestId: string;
  readonly operation: InterviewCloudOperation;
  readonly status: "authorized" | "completed";
  readonly result?: Readonly<Record<string, unknown>>;
  readonly provider?: string;
  readonly model?: string;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number; readonly units?: number };
  readonly audit?: { readonly decision: string; readonly reason?: string };
}

export interface InterviewCloudGateway {
  executeInterview(
    accountId: string,
    request: InterviewCloudGatewayRequest,
    signal?: AbortSignal,
  ): Promise<InterviewCloudGatewayResponse>;
}

export interface CloudGatewayDependencies {
  readonly cloudAI?: CloudAIService;
  readonly interviewGateway?: InterviewCloudGateway;
}

export function normalizeCloudProviderError(error: unknown): { code: string; message: string; retryable: boolean } {
  const msg = error instanceof Error ? error.message : "Provider request failed.";
  const lower = msg.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { code: "provider_timeout", message: "The cloud provider timed out.", retryable: true };
  }
  if (lower.includes("rate") || lower.includes("quota") || lower.includes("429")) {
    return { code: "rate_limited", message: "Cloud provider quota or rate limit was reached.", retryable: true };
  }
  if (lower.includes("unauthorized") || lower.includes("forbidden") || lower.includes("401") || lower.includes("403")) {
    return { code: "unauthorized", message: "Cloud provider authorization failed.", retryable: false };
  }
  if (lower.includes("unavailable") || lower.includes("503") || lower.includes("network")) {
    return { code: "provider_unavailable", message: "Cloud provider is unavailable.", retryable: true };
  }
  return { code: "provider_error", message: "Cloud provider request failed.", retryable: false };
}
