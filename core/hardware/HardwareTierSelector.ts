// core/hardware/HardwareTierSelector.ts


/**
 * Veyra Hardware Tier Selector
 *
 * Location:
 * core/hardware/HardwareTierSelector.ts
 *
 * Selects the safest useful hardware tier for local AI inference.
 *
 * IMPORTANT:
 * RAM alone is not enough.
 *
 * The selector considers:
 * - total RAM
 * - available RAM
 * - CPU cores
 * - GPU VRAM
 * - GPU availability
 * - acceleration
 * - current system load
 */

import type {
  HardwareProfile,
  HardwareTier,
} from "./HardwareProfile";

function getMaximumVRAM(
  profile: Pick<HardwareProfile, "gpus">,
): number {
  return profile.gpus.reduce(
    (maximum, gpu) =>
      Math.max(maximum, gpu.vramBytes),
    0,
  );
}

function getMaximumVRAMGB(
  profile: Pick<HardwareProfile, "gpus">,
): number {
  return getMaximumVRAM(profile) / 1024 ** 3;
}

function hasDedicatedGPU(
  profile: Pick<HardwareProfile, "gpus">,
): boolean {
  return profile.gpus.some(
    (gpu) =>
      !gpu.isIntegrated &&
      gpu.vramBytes > 0,
  );
}

export class HardwareTierSelector {
  select(profile: HardwareProfile): HardwareTier {
    const ramGB = profile.memory.totalGB;
    const availableRAMGB = profile.memory.availableGB;

    const logicalCores = profile.cpu.logicalCores;
    const physicalCores = profile.cpu.physicalCores;

    const vramGB = getMaximumVRAMGB(profile);

    const heavyLoad =
      profile.systemLoad.cpuUsagePercent >= 85 ||
      profile.systemLoad.memoryUsagePercent >= 90;

    const memoryPressure =
      profile.systemLoad.memoryUsagePercent >= 80 ||
      availableRAMGB < 2;

    /**
     * Severe runtime pressure should immediately reduce
     * the selected tier.
     */
    if (ramGB <= 4 || availableRAMGB < 1.5) {
      return "ultra_low";
    }

    /**
     * 8 GB machines.
     */
    if (ramGB < 12) {
      return "low";
    }

    /**
     * Standard 16 GB class machines.
     */
    if (ramGB < 24) {
      if (
        heavyLoad ||
        memoryPressure
      ) {
        return "low";
      }

      return "standard";
    }

    /**
     * 32 GB class machines.
     */
    if (ramGB < 48) {
      if (
        heavyLoad ||
        memoryPressure
      ) {
        return "standard";
      }

      if (
        hasDedicatedGPU(profile) &&
        vramGB >= 8 &&
        logicalCores >= 8
      ) {
        return "high";
      }

      return "high";
    }

    /**
     * 64 GB class machines.
     */
    if (ramGB < 96) {
      if (
        heavyLoad ||
        memoryPressure
      ) {
        return "high";
      }

      if (
        hasDedicatedGPU(profile) &&
        vramGB >= 12 &&
        logicalCores >= 12
      ) {
        return "very_high";
      }

      return "very_high";
    }

    /**
     * 128 GB class machines.
     */
    if (ramGB < 192) {
      if (
        hasDedicatedGPU(profile) &&
        vramGB >= 16 &&
        logicalCores >= 16
      ) {
        return "workstation";
      }

      return "workstation";
    }

    /**
     * 192 GB+.
     */
    if (
      ramGB >= 192 &&
      logicalCores >= 24 &&
      vramGB >= 24
    ) {
      return "extreme";
    }

    return "workstation";
  }

  /**
   * Returns a lower tier when the machine is under pressure.
   *
   * This lets Veyra dynamically downgrade models without
   * changing the permanent hardware classification.
   */
  downgrade(
    tier: HardwareTier,
  ): HardwareTier {
    switch (tier) {
      case "extreme":
        return "workstation";

      case "workstation":
        return "very_high";

      case "very_high":
        return "high";

      case "high":
        return "standard";

      case "standard":
        return "low";

      case "low":
        return "ultra_low";

      case "ultra_low":
      default:
        return "ultra_low";
    }
  }

  /**
   * Whether this machine should prioritize latency over
   * maximum model quality.
   */
  shouldPrioritizeLatency(
    profile: HardwareProfile,
  ): boolean {
    const vramGB = getMaximumVRAMGB(profile);

    return (
      profile.memory.totalGB <= 16 ||
      vramGB < 8 ||
      profile.systemLoad.cpuUsagePercent >= 70 ||
      profile.systemLoad.memoryUsagePercent >= 75
    );
  }

  /**
   * Whether multiple heavyweight AI models should remain
   * loaded simultaneously.
   */
  shouldAvoidConcurrentHeavyModels(
    profile: HardwareProfile,
  ): boolean {
    const vramGB = getMaximumVRAMGB(profile);

    return (
      profile.memory.totalGB < 32 ||
      vramGB < 12
    );
  }
}