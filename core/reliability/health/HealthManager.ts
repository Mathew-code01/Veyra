// ============================================================================
// FILE: core/reliability/health/HealthManager.ts
//
// PURPOSE:
// Coordinates health checks and maintains the latest known health state.
//
// It does not perform recovery.
// ============================================================================

import type { HealthCheckRequest, HealthStatus } from "./HealthCheck";

import {
  HEALTH_STATES,
  isAvailableState,
  isHealthyState,
  type HealthState,
} from "./HealthState";

import { HealthRegistry } from "./HealthRegistry";

export class HealthManager {
  private readonly registry: HealthRegistry;

  private readonly states = new Map<string, HealthStatus>();

  public constructor(registry = new HealthRegistry()) {
    this.registry = registry;
  }

  public async check(request: HealthCheckRequest): Promise<HealthStatus> {
    const startedAt = Date.now();

    try {
      const result = await this.registry.run(request);

      const status: HealthStatus = Object.freeze({
        ...result,
        latencyMs: result.latencyMs ?? Date.now() - startedAt,
        checkedAt: result.checkedAt ?? Date.now(),
      });

      this.states.set(request.componentId, status);

      return status;
    } catch (error) {
      const status: HealthStatus = Object.freeze({
        componentId: request.componentId,
        state: HEALTH_STATES.FAILED,
        checkedAt: Date.now(),
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });

      this.states.set(request.componentId, status);

      return status;
    }
  }

  public getState(componentId: string): HealthState {
    return this.states.get(componentId)?.state ?? HEALTH_STATES.UNKNOWN;
  }

  public getStatus(componentId: string): HealthStatus | undefined {
    return this.states.get(componentId);
  }

  public isHealthy(componentId: string): boolean {
    return isHealthyState(this.getState(componentId));
  }

  public isAvailable(componentId: string): boolean {
    return isAvailableState(this.getState(componentId));
  }

  public setState(
    componentId: string,
    state: HealthState,
    message?: string,
  ): void {
    this.states.set(
      componentId,
      Object.freeze({
        componentId,
        state,
        checkedAt: Date.now(),
        message,
      }),
    );
  }

  public getAll(): readonly HealthStatus[] {
    return Object.freeze([...this.states.values()]);
  }

  public getRegistry(): HealthRegistry {
    return this.registry;
  }
}
