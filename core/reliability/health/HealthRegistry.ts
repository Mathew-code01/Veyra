// ============================================================================
// FILE: core/reliability/health/HealthRegistry.ts
//
// PURPOSE:
// Registry for health checks.
//
// The registry does not execute application operations.
// It only manages registered health-check implementations.
// ============================================================================

import type {
  HealthCheck,
  HealthCheckRequest,
  HealthStatus,
} from "./HealthCheck";

export class HealthRegistry {
  private readonly checks = new Map<string, HealthCheck>();

  public register(check: HealthCheck): void {
    if (!check.id.trim()) {
      throw new Error("Health check id cannot be empty.");
    }

    if (this.checks.has(check.id)) {
      throw new Error(`Health check "${check.id}" is already registered.`);
    }

    this.checks.set(check.id, check);
  }

  public unregister(id: string): boolean {
    return this.checks.delete(id);
  }

  public get(id: string): HealthCheck | undefined {
    return this.checks.get(id);
  }

  public has(id: string): boolean {
    return this.checks.has(id);
  }

  public list(): readonly HealthCheck[] {
    return Object.freeze([...this.checks.values()]);
  }

  public async run(request: HealthCheckRequest): Promise<HealthStatus> {
    const check = this.checks.get(request.componentId);

    if (!check) {
      return Object.freeze({
        componentId: request.componentId,
        state: "unknown",
        checkedAt: Date.now(),
        message: "No health check is registered.",
      });
    }

    return check.check(request);
  }
}
