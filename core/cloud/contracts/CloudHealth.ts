// ============================================================================
// FILE: core/cloud/contracts/CloudHealth.ts
// ============================================================================

export type CloudProviderStatus =
  "healthy" | "degraded" | "unavailable" | "disabled" | "unknown";

export interface CloudHealth {
  readonly providerId: string;

  readonly status: CloudProviderStatus;

  readonly checkedAt: number;

  readonly latencyMs?: number;

  readonly error?: string;

  readonly modelsAvailable?: number;

  readonly details?: Readonly<Record<string, unknown>>;
}
