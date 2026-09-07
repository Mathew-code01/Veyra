// core/hardware/AccelerationDetector.ts


/**
 * Veyra Acceleration Detector
 *
 * Location:
 * core/hardware/AccelerationDetector.ts
 *
 * Detects available hardware acceleration paths.
 *
 * The result is intentionally capability-based rather than
 * model-specific. Model compatibility is handled elsewhere.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

import type {
  AccelerationProfile,
  GPUProfile,
  OperatingSystem,
} from "./HardwareProfile";

const execFileAsync = promisify(execFile);

interface CommandResult {
  readonly available: boolean;
  readonly output?: string;
}

async function commandExists(
  command: string,
  args: readonly string[] = [],
): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: 2_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    return {
      available: true,
      output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    };
  } catch {
    return {
      available: false,
    };
  }
}

function getOperatingSystem(): OperatingSystem {
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

function hasNvidiaGPU(gpus: readonly GPUProfile[]): boolean {
  return gpus.some((gpu) => gpu.vendor === "nvidia");
}

function hasAppleGPU(gpus: readonly GPUProfile[]): boolean {
  return gpus.some((gpu) => gpu.vendor === "apple");
}

function hasVulkanCapableGPU(gpus: readonly GPUProfile[]): boolean {
  return gpus.some((gpu) => gpu.capabilities.vulkan);
}

function hasDirectMLCapableGPU(
  gpus: readonly GPUProfile[],
): boolean {
  return gpus.some(
    (gpu) =>
      gpu.vendor === "nvidia" ||
      gpu.vendor === "amd" ||
      gpu.vendor === "intel",
  );
}

export async function detectAcceleration(
  gpus: readonly GPUProfile[],
): Promise<AccelerationProfile> {
  const operatingSystem = getOperatingSystem();

  const nvidiaPresent = hasNvidiaGPU(gpus);
  const applePresent = hasAppleGPU(gpus);

  let cuda = false;
  let vulkan = hasVulkanCapableGPU(gpus);
  let directml = false;
  let metal = false;

  if (nvidiaPresent) {
    const nvidiaSmi = await commandExists("nvidia-smi", [
      "--query-gpu=name",
      "--format=csv,noheader",
    ]);

    cuda = nvidiaSmi.available;
  }

  if (operatingSystem === "windows") {
    directml = hasDirectMLCapableGPU(gpus);
  }

  if (operatingSystem === "macos" && applePresent) {
    metal = true;
  }

  /**
   * Vulkan is commonly exposed through the Vulkan loader.
   * We don't require a successful `vulkaninfo` command because
   * some systems have the runtime available without the CLI.
   */
  if (!vulkan) {
    const vulkanInfo = await commandExists(
      process.platform === "win32"
        ? "vulkaninfo.exe"
        : "vulkaninfo",
    );

    vulkan = vulkanInfo.available;
  }

  let preferredBackend: AccelerationProfile["preferredBackend"] =
    "cpu";

  if (cuda) {
    preferredBackend = "cuda";
  } else if (metal) {
    preferredBackend = "metal";
  } else if (vulkan) {
    preferredBackend = "vulkan";
  } else if (directml) {
    preferredBackend = "directml";
  }

  const availableBackends = ["cpu"];

  if (cuda) {
    availableBackends.push("cuda");
  }

  if (metal) {
    availableBackends.push("metal");
  }

  if (vulkan) {
    availableBackends.push("vulkan");
  }

  if (directml) {
    availableBackends.push("directml");
  }

  return {
    cuda,
    vulkan,
    directml,
    metal,

    preferredBackend,

    availableBackends,
  };
}

/**
 * Exported for testing.
 */
export function detectOperatingSystem(): OperatingSystem {
  return getOperatingSystem();
}

/**
 * Exported for diagnostics/testing.
 */
export function getHostArchitecture(): string {
  return os.arch();
}