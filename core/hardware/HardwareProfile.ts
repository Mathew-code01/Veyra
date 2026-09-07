// core/hardware/HardwareProfile.ts


/**
 * Veyra Hardware Profile
 *
 * Location:
 * core/hardware/HardwareProfile.ts
 *
 * This file contains the normalized representation of the user's
 * machine capabilities.
 *
 * IMPORTANT:
 * This module is Node/Electron-main-process code.
 * It must not be imported directly by the React renderer.
 */

export type OperatingSystem =
  | "windows"
  | "macos"
  | "linux"
  | "freebsd"
  | "unknown";

export type Architecture =
  | "x64"
  | "arm64"
  | "arm"
  | "ia32"
  | "unknown";

export type GPUVendor =
  | "nvidia"
  | "amd"
  | "intel"
  | "apple"
  | "qualcomm"
  | "unknown";

export type DiskType =
  | "ssd"
  | "hdd"
  | "nvme"
  | "unknown";

export type HardwareTier =
  | "ultra_low"
  | "low"
  | "standard"
  | "high"
  | "very_high"
  | "workstation"
  | "extreme";

export interface CPUProfile {
  readonly manufacturer: string;
  readonly brand: string;
  readonly model: string;

  readonly physicalCores: number;
  readonly logicalCores: number;

  /**
   * Base/max speed in GHz where available.
   */
  readonly speedGHz?: number;

  readonly architecture: Architecture;
}

export interface GPUProfile {
  readonly vendor: GPUVendor;
  readonly model: string;

  /**
   * Dedicated VRAM in bytes where available.
   */
  readonly vramBytes: number;

  /**
   * Shared/system GPU memory where available.
   */
  readonly sharedMemoryBytes?: number;

  readonly driverVersion?: string;

  readonly isIntegrated: boolean;

  readonly capabilities: {
    readonly cuda: boolean;
    readonly vulkan: boolean;
    readonly directml: boolean;
    readonly metal: boolean;
  };
}

export interface MemoryProfile {
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly usedBytes: number;

  readonly totalGB: number;
  readonly availableGB: number;
  readonly usedGB: number;
}

export interface StorageProfile {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly usedBytes: number;

  readonly freeGB: number;

  readonly diskType: DiskType;
}

export interface SystemLoadProfile {
  readonly cpuUsagePercent: number;
  readonly memoryUsagePercent: number;

  readonly sampledAt: number;
}

export interface AccelerationProfile {
  readonly cuda: boolean;
  readonly vulkan: boolean;
  readonly directml: boolean;
  readonly metal: boolean;

  readonly preferredBackend:
    | "cuda"
    | "metal"
    | "vulkan"
    | "directml"
    | "cpu";

  readonly availableBackends: readonly string[];
}

export interface RuntimeAvailability {
  readonly ollama: boolean;
  readonly llamaCpp: boolean;
  readonly whisperCpp: boolean;
}

export interface HardwareProfile {
  readonly version: 1;

  readonly detectedAt: number;

  readonly operatingSystem: OperatingSystem;
  readonly platform: string;
  readonly architecture: Architecture;

  readonly cpu: CPUProfile;
  readonly memory: MemoryProfile;

  readonly gpus: readonly GPUProfile[];

  readonly storage: StorageProfile;

  readonly acceleration: AccelerationProfile;

  readonly systemLoad: SystemLoadProfile;

  readonly runtime: RuntimeAvailability;

  readonly tier: HardwareTier;

  /**
   * Indicates whether the machine has enough resources
   * for local AI processing.
   */
  readonly localAIRecommended: boolean;

  /**
   * Indicates whether Veyra should avoid loading multiple
   * heavyweight models simultaneously.
   */
  readonly memoryConstrained: boolean;

  /**
   * Indicates whether vision should be treated as on-demand.
   */
  readonly visionOnDemandOnly: boolean;
}

export function bytesToGB(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }

  return bytes / 1024 ** 3;
}

export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

export function createMemoryProfile(
  totalBytes: number,
  availableBytes: number,
): MemoryProfile {
  const safeTotal = Math.max(0, totalBytes);
  const safeAvailable = Math.min(
    safeTotal,
    Math.max(0, availableBytes),
  );

  const usedBytes = Math.max(0, safeTotal - safeAvailable);

  return {
    totalBytes: safeTotal,
    availableBytes: safeAvailable,
    usedBytes,

    totalGB: bytesToGB(safeTotal),
    availableGB: bytesToGB(safeAvailable),
    usedGB: bytesToGB(usedBytes),
  };
}