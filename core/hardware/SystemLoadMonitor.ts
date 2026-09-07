// core/hardware/SystemLoadMonitor.ts


/**
 * Veyra System Load Monitor
 *
 * Location:
 * core/hardware/SystemLoadMonitor.ts
 *
 * Provides lightweight runtime resource measurements.
 */

import os from "node:os";

import {
  clampPercentage,
  createMemoryProfile,
  type SystemLoadProfile,
} from "./HardwareProfile";

export interface SystemLoadSnapshot {
  readonly cpuUsagePercent: number;
  readonly memoryUsagePercent: number;
  readonly availableMemoryBytes: number;
  readonly totalMemoryBytes: number;
  readonly sampledAt: number;
}

function calculateCpuUsage(
  previous: ReturnType<typeof os.cpus>,
  current: ReturnType<typeof os.cpus>,
): number {
  if (previous.length === 0 || current.length === 0) {
    return 0;
  }

  let previousIdle = 0;
  let previousTotal = 0;

  let currentIdle = 0;
  let currentTotal = 0;

  for (const cpu of previous) {
    previousIdle += cpu.times.idle;

    previousTotal +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle;
  }

  for (const cpu of current) {
    currentIdle += cpu.times.idle;

    currentTotal +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle;
  }

  const totalDelta = currentTotal - previousTotal;
  const idleDelta = currentIdle - previousIdle;

  if (totalDelta <= 0) {
    return 0;
  }

  return clampPercentage(
    ((totalDelta - idleDelta) / totalDelta) * 100,
  );
}

export class SystemLoadMonitor {
  private previousCpuSnapshot = os.cpus();

  async sample(): Promise<SystemLoadSnapshot> {
    const currentCpuSnapshot = os.cpus();

    const cpuUsagePercent = calculateCpuUsage(
      this.previousCpuSnapshot,
      currentCpuSnapshot,
    );

    this.previousCpuSnapshot = currentCpuSnapshot;

    const totalMemoryBytes = os.totalmem();
    const availableMemoryBytes = os.freemem();

    const memoryProfile = createMemoryProfile(
      totalMemoryBytes,
      availableMemoryBytes,
    );

    const memoryUsagePercent =
      memoryProfile.totalBytes > 0
        ? clampPercentage(
            (memoryProfile.usedBytes /
              memoryProfile.totalBytes) *
              100,
          )
        : 0;

    return {
      cpuUsagePercent,
      memoryUsagePercent,
      availableMemoryBytes,
      totalMemoryBytes,
      sampledAt: Date.now(),
    };
  }

  async getProfile(): Promise<SystemLoadProfile> {
    const snapshot = await this.sample();

    return {
      cpuUsagePercent: snapshot.cpuUsagePercent,
      memoryUsagePercent: snapshot.memoryUsagePercent,
      sampledAt: snapshot.sampledAt,
    };
  }

  static isUnderHeavyLoad(
    snapshot: SystemLoadSnapshot,
  ): boolean {
    return (
      snapshot.cpuUsagePercent >= 85 ||
      snapshot.memoryUsagePercent >= 90
    );
  }

  static isMemoryPressure(
    snapshot: SystemLoadSnapshot,
  ): boolean {
    return snapshot.memoryUsagePercent >= 80;
  }
}