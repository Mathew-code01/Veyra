// ============================================================================
// FILE: core/reliability/contracts/HealthContract.ts
//
// PURPOSE:
// Public health-management contract.
//
// CORE QUESTION:
// "Is the dependency capable of performing its operation?"
//
// Health is observational. It does not restart arbitrary application
// components or perform business-specific recovery.
// ============================================================================

import type { HealthCheckRequest, HealthStatus } from "../health/HealthCheck";

import type { HealthState } from "../health/HealthState";

export interface HealthContract {
  check(request: HealthCheckRequest): Promise<HealthStatus>;

  getState(componentId: string): HealthState | undefined;

  isHealthy(componentId: string): boolean;

  isAvailable(componentId: string): boolean;
}
