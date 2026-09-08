// Relative path: shared/types/hardware.ts

/**
 * Veyra Shared Hardware Types
 *
 * IMPORTANT:
 * These types are renderer-safe.
 *
 * Do not place Node.js objects, Buffers, streams, functions,
 * systeminformation objects, or Electron objects in this file.
 */

export type SharedOperatingSystem =
  "windows" | "macos" | "linux" | "freebsd" | "unknown";

export type SharedArchitecture = "x64" | "arm64" | "arm" | "ia32" | "unknown";

export type SharedGPUVendor =
  "nvidia" | "amd" | "intel" | "apple" | "qualcomm" | "unknown";

export type SharedHardwareTier =
  | "ultra_low"
  | "low"
  | "standard"
  | "high"
  | "very_high"
  | "workstation"
  | "extreme";

export type SharedAccelerationBackend =
  "cuda" | "metal" | "vulkan" | "directml" | "cpu";

export interface SharedCPUProfile {
  readonly manufacturer: string;
  readonly brand: string;
  readonly model: string;
  readonly physicalCores: number;
  readonly logicalCores: number;
  readonly speedGHz?: number;
  readonly architecture: SharedArchitecture;
}

export interface SharedGPUCapabilities {
  readonly cuda: boolean;
  readonly vulkan: boolean;
  readonly directml: boolean;
  readonly metal: boolean;
}

export interface SharedGPUProfile {
  readonly vendor: SharedGPUVendor;
  readonly model: string;
  readonly vramBytes: number;
  readonly sharedMemoryBytes?: number;
  readonly driverVersion?: string;
  readonly isIntegrated: boolean;
  readonly capabilities: SharedGPUCapabilities;
}

export interface SharedMemoryProfile {
  readonly totalBytes: number;
  readonly availableBytes: number;
  readonly usedBytes: number;

  readonly totalGB: number;
  readonly availableGB: number;
  readonly usedGB: number;
}

export interface SharedStorageProfile {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly usedBytes: number;
  readonly freeGB: number;

  readonly diskType: "ssd" | "hdd" | "nvme" | "unknown";
}

export interface SharedSystemLoadProfile {
  readonly cpuUsagePercent: number;
  readonly memoryUsagePercent: number;
  readonly sampledAt: number;
}

export interface SharedAccelerationProfile {
  readonly cuda: boolean;
  readonly vulkan: boolean;
  readonly directml: boolean;
  readonly metal: boolean;

  readonly preferredBackend: SharedAccelerationBackend;

  readonly availableBackends: readonly SharedAccelerationBackend[];
}

export interface SharedRuntimeAvailability {
  readonly ollama: boolean;
  readonly llamaCpp: boolean;
  readonly whisperCpp: boolean;
}

/**
 * Sanitized hardware profile safe for IPC.
 *
 * No secrets.
 * No file handles.
 * No processes.
 * No arbitrary command output.
 */
export interface SharedHardwareProfile {
  readonly version: 1;

  readonly detectedAt: number;

  readonly operatingSystem: SharedOperatingSystem;
  readonly platform: string;
  readonly architecture: SharedArchitecture;

  readonly cpu: SharedCPUProfile;
  readonly memory: SharedMemoryProfile;
  readonly gpus: readonly SharedGPUProfile[];

  readonly storage: SharedStorageProfile;

  readonly acceleration: SharedAccelerationProfile;

  readonly systemLoad: SharedSystemLoadProfile;

  readonly runtime: SharedRuntimeAvailability;

  readonly tier: SharedHardwareTier;

  readonly localAIRecommended: boolean;
  readonly memoryConstrained: boolean;
  readonly visionOnDemandOnly: boolean;
}

export interface HardwareModelRecommendation {
  readonly modelId: string;
  readonly modality: "llm" | "stt" | "vision" | "tts";
  readonly role: "primary" | "fallback";
  readonly rank: number;
}

export interface HardwareModelPlan {
  readonly generatedAt: number;
  readonly hardwareTier: SharedHardwareTier;

  readonly primary: Readonly<
    Partial<Record<HardwareModelRecommendation["modality"], string>>
  >;

  readonly fallbacks: Readonly<
    Partial<Record<HardwareModelRecommendation["modality"], readonly string[]>>
  >;
}

export interface HardwareSnapshotResponse {
  readonly profile: SharedHardwareProfile;
}

export interface HardwareModelPlanResponse {
  readonly profile: SharedHardwareProfile;
  readonly plan: HardwareModelPlan;
}
