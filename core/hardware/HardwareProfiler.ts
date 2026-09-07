// core/hardware/HardwareProfiler.ts


/**
 * Veyra Hardware Profiler
 *
 * Location:
 * core/hardware/HardwareProfiler.ts
 *
 * Collects and normalizes:
 * - operating system
 * - architecture
 * - CPU
 * - RAM
 * - GPU
 * - VRAM
 * - storage
 * - acceleration
 * - runtime load
 *
 * The result becomes the source of truth for model selection.
 */

import os from "node:os";
import { existsSync } from "node:fs";

import si from "systeminformation";

import {
  bytesToGB,
  createMemoryProfile,
  type CPUProfile,
  type DiskType,
  type GPUProfile,
  type HardwareProfile,
  type OperatingSystem,
  type Architecture,
  type StorageProfile,
  type RuntimeAvailability,
} from "./HardwareProfile";

import { detectAcceleration } from "./AccelerationDetector";
import { HardwareTierSelector } from "./HardwareTierSelector";
import { SystemLoadMonitor } from "./SystemLoadMonitor";

function mapOperatingSystem(): OperatingSystem {
  switch (process.platform) {
    case "win32":
      return "windows";

    case "darwin":
      return "macos";

    case "linux":
      return "linux";

    case "freebsd":
      return "freebsd";

    default:
      return "unknown";
  }
}

function mapArchitecture(): Architecture {
  switch (process.arch) {
    case "x64":
      return "x64";

    case "arm64":
      return "arm64";

    case "arm":
      return "arm";

    case "ia32":
      return "ia32";

    default:
      return "unknown";
  }
}

function normalizeGPUVendor(
  vendor: string | undefined,
  model: string | undefined,
): GPUProfile["vendor"] {
  const value =
    `${vendor ?? ""} ${model ?? ""}`.toLowerCase();

  if (value.includes("nvidia")) {
    return "nvidia";
  }

  if (
    value.includes("amd") ||
    value.includes("radeon") ||
    value.includes("advanced micro devices")
  ) {
    return "amd";
  }

  if (value.includes("intel")) {
    return "intel";
  }

  if (
    value.includes("apple") ||
    value.includes("m1") ||
    value.includes("m2") ||
    value.includes("m3") ||
    value.includes("m4") ||
    value.includes("m5")
  ) {
    return "apple";
  }

  if (value.includes("qualcomm")) {
    return "qualcomm";
  }

  return "unknown";
}

function normalizeDiskType(
  type: string | undefined,
  name: string | undefined,
): DiskType {
  const value =
    `${type ?? ""} ${name ?? ""}`.toLowerCase();

  if (value.includes("nvme")) {
    return "nvme";
  }

  if (
    value.includes("ssd") ||
    value.includes("solid")
  ) {
    return "ssd";
  }

  if (
    value.includes("hdd") ||
    value.includes("hard disk")
  ) {
    return "hdd";
  }

  return "unknown";
}

function safeNumber(
  value: unknown,
  fallback = 0,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

async function detectCPU(): Promise<CPUProfile> {
  const cpu = await si.cpu();

  return {
    manufacturer: cpu.manufacturer ?? "Unknown",
    brand: cpu.brand ?? "Unknown",
    model: cpu.brand ?? "Unknown",

    physicalCores: Math.max(
      1,
      safeNumber(cpu.physicalCores, 1),
    ),

    logicalCores: Math.max(
      1,
      safeNumber(
        cpu.cores,
        os.cpus().length || 1,
      ),
    ),

    speedGHz:
      cpu.speed > 0
        ? cpu.speed
        : undefined,

    architecture: mapArchitecture(),
  };
}

async function detectMemory() {
  const memory = await si.mem();

  return createMemoryProfile(
    memory.total,
    memory.available,
  );
}

async function detectGPUs(): Promise<GPUProfile[]> {
  const graphics = await si.graphics();

  return graphics.controllers.map(
    (controller) => {
      const vendor = normalizeGPUVendor(
        controller.vendor,
        controller.model,
      );

      const vramMB = safeNumber(
        controller.vram,
      );

      const vramBytes =
        Math.max(0, vramMB) * 1024 ** 2;

      const isIntegrated =
        Boolean(
          controller.model
            ?.toLowerCase()
            .includes("integrated"),
        ) ||
        vendor === "intel" &&
          vramBytes === 0;

      return {
        vendor,

        model:
          controller.model ??
          "Unknown GPU",

        vramBytes,

        sharedMemoryBytes:
          undefined,

        driverVersion:
          controller.driverVersion ??
          undefined,

        isIntegrated,

        capabilities: {
          cuda: vendor === "nvidia",
          vulkan: true,
          directml:
            process.platform === "win32" &&
            (
              vendor === "nvidia" ||
              vendor === "amd" ||
              vendor === "intel"
            ),
          metal:
            process.platform === "darwin" &&
            vendor === "apple",
        },
      };
    },
  );
}

async function detectStorage(): Promise<StorageProfile> {
  try {
    const filesystems = await si.fsSize();

    /**
     * Prefer the filesystem containing the current
     * working directory.
     */
    const root =
      process.platform === "win32"
        ? `${process.cwd().slice(0, 2)}`
        : "/";

    const matching =
      filesystems.find(
        (filesystem) =>
          filesystem.mount
            .toLowerCase()
            .startsWith(root.toLowerCase()),
      ) ??
      filesystems[0];

    if (!matching) {
      return {
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0,
        freeGB: 0,
        diskType: "unknown",
      };
    }

    const totalBytes = Math.max(
      0,
      safeNumber(matching.size),
    );

    const freeBytes = Math.max(
      0,
      safeNumber(matching.available),
    );

    return {
      totalBytes,
      freeBytes,

      usedBytes: Math.max(
        0,
        totalBytes - freeBytes,
      ),

      freeGB: bytesToGB(freeBytes),

      diskType: normalizeDiskType(
        matching.type,
        matching.fs,
      ),
    };
  } catch {
    return {
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      freeGB: 0,
      diskType: "unknown",
    };
  }
}

async function detectRuntime(
  operatingSystem: OperatingSystem,
): Promise<RuntimeAvailability> {
  /**
   * These checks intentionally remain conservative.
   *
   * Runtime discovery will later be expanded by ModelManager.
   */

  const localAppData =
    process.env.LOCALAPPDATA;

  const appData =
    process.env.APPDATA;

  const home =
    process.env.HOME ||
    os.homedir();

  const possibleOllamaPaths =
    operatingSystem === "windows"
      ? [
          `${localAppData ?? ""}\\Programs\\Ollama\\Ollama.exe`,
          `${localAppData ?? ""}\\Ollama\\Ollama.exe`,
        ]
      : [
          `${home}/.ollama`,
          "/usr/local/bin/ollama",
          "/opt/homebrew/bin/ollama",
        ];

  const ollamaFilesystemDetected =
    possibleOllamaPaths.some(
      (path) =>
        path.length > 0 &&
        existsSync(path),
    );

  const possibleLlamaCppPaths = [
    `${process.cwd()}/llama-server`,
    `${process.cwd()}/llama-server.exe`,
    `${process.cwd()}/bin/llama-server`,
    `${process.cwd()}/bin/llama-server.exe`,
  ];

  const llamaCppFilesystemDetected =
    possibleLlamaCppPaths.some(
      (path) =>
        existsSync(path),
    );

  const whisperCppPaths = [
    `${process.cwd()}/whisper-cli`,
    `${process.cwd()}/whisper-cli.exe`,
    `${process.cwd()}/bin/whisper-cli`,
    `${process.cwd()}/bin/whisper-cli.exe`,
  ];

  const whisperCppFilesystemDetected =
    whisperCppPaths.some(
      (path) =>
        existsSync(path),
    );

  /**
   * appData is referenced intentionally so environments
   * that only expose APPDATA still participate in discovery.
   */
  void appData;

  return {
    ollama: ollamaFilesystemDetected,
    llamaCpp: llamaCppFilesystemDetected,
    whisperCpp: whisperCppFilesystemDetected,
  };
}

export class HardwareProfiler {
  private readonly tierSelector =
    new HardwareTierSelector();

  private readonly loadMonitor =
    new SystemLoadMonitor();

  async profile(): Promise<HardwareProfile> {
    const operatingSystem =
      mapOperatingSystem();

    const architecture =
      mapArchitecture();

    const [
      cpu,
      memory,
      gpus,
      storage,
      systemLoad,
    ] = await Promise.all([
      detectCPU(),
      detectMemory(),
      detectGPUs(),
      detectStorage(),
      this.loadMonitor.getProfile(),
    ]);

    const acceleration =
      await detectAcceleration(gpus);

    const runtime =
      await detectRuntime(
        operatingSystem,
      );

    /**
     * Construct a temporary profile so the tier selector
     * can make its decision.
     */
    const preliminaryProfile =
      {
        version: 1 as const,

        detectedAt: Date.now(),

        operatingSystem,
        platform: process.platform,
        architecture,

        cpu,
        memory,

        gpus,

        storage,

        acceleration,

        systemLoad,

        runtime,

        tier: "ultra_low" as const,

        localAIRecommended: false,
        memoryConstrained: false,
        visionOnDemandOnly: true,
      };

    const tier =
      this.tierSelector.select(
        preliminaryProfile,
      );

    const memoryConstrained =
      memory.availableGB < 4 ||
      systemLoad.memoryUsagePercent >= 80;

    const visionOnDemandOnly =
      tier === "ultra_low" ||
      tier === "low" ||
      memoryConstrained;

    const localAIRecommended =
      memory.totalGB >= 4 &&
      memory.availableGB >= 1.5;

    return {
      ...preliminaryProfile,

      tier,

      localAIRecommended,

      memoryConstrained,

      visionOnDemandOnly,
    };
  }

  async refresh(): Promise<HardwareProfile> {
    return this.profile();
  }
}

/**
 * Convenience function for startup code.
 */
export async function profileHardware(): Promise<HardwareProfile> {
  const profiler = new HardwareProfiler();

  return profiler.profile();
}