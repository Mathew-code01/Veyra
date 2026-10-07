// ============================================================================
// FILE: core/reliability/health/HealthCheck.ts
//
// PURPOSE:
// Health-check definitions and results.
// ============================================================================

import type { HealthState } from "./HealthState";

export interface HealthCheckRequest {
  readonly componentId: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface HealthStatus {
  readonly componentId: string;
  readonly state: HealthState;
  readonly checkedAt: number;
  readonly latencyMs?: number;
  readonly message?: string;
  readonly details?: Readonly<Record<string, string>>;
}

export interface HealthCheck {
  readonly id: string;
  readonly componentId: string;

  check(request: HealthCheckRequest): Promise<HealthStatus>;
}
