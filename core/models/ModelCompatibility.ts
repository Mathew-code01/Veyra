// Relative path: core/models/ModelCompatibility.ts

import type {
  HardwareProfile,
  HardwareTier,
} from "../hardware/HardwareProfile";
import type { ModelDefinition } from "./ModelRegistry";

export type CompatibilityLevel =
  "compatible" | "compatible_with_warning" | "incompatible";

export interface ModelCompatibilityResult {
  readonly modelId: string;
  readonly level: CompatibilityLevel;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly blockingReasons: readonly string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getBestGpuVramBytes(profile: HardwareProfile): number {
  return profile.gpus.reduce(
    (highest, gpu) => Math.max(highest, gpu.vramBytes ?? 0),
    0,
  );
}

function getBestGpu(profile: HardwareProfile) {
  return profile.gpus.reduce((best, gpu) => {
    if (!best) {
      return gpu;
    }

    return (gpu.vramBytes ?? 0) > (best.vramBytes ?? 0) ? gpu : best;
  }, profile.gpus[0]);
}

export class ModelCompatibility {
  public evaluate(
    model: ModelDefinition,
    profile: HardwareProfile,
  ): ModelCompatibilityResult {
    const reasons: string[] = [];
    const warnings: string[] = [];
    const blockingReasons: string[] = [];

    let score = 100;

    const totalRam = profile.memory.totalBytes;
    const availableRam = profile.memory.availableBytes;
    const bestVram = getBestGpuVramBytes(profile);

    /*
     * ------------------------------------------------------------------------
     * Hardware tier
     * ------------------------------------------------------------------------
     */

    if (!model.supportedHardwareTiers.includes(profile.tier)) {
      blockingReasons.push(
        `Model is not recommended for hardware tier "${profile.tier}".`,
      );

      score -= 40;
    } else {
      reasons.push(`Hardware tier "${profile.tier}" supports this model.`);
    }

    /*
     * ------------------------------------------------------------------------
     * RAM
     * ------------------------------------------------------------------------
     */

    if (totalRam < model.requirements.minimumRamBytes) {
      blockingReasons.push(
        `System RAM is below the model minimum requirement.`,
      );

      score -= 50;
    } else if (totalRam < model.requirements.recommendedRamBytes) {
      warnings.push(`System RAM is below the recommended amount.`);

      score -= 10;
    } else {
      reasons.push("System RAM meets the recommended requirement.");
    }

    /*
     * ------------------------------------------------------------------------
     * Available RAM
     * ------------------------------------------------------------------------
     */

    if (availableRam < model.requirements.minimumRamBytes * 0.75) {
      blockingReasons.push(
        "Currently available RAM is too low to safely start the model.",
      );

      score -= 35;
    } else if (availableRam < model.requirements.recommendedRamBytes) {
      warnings.push(
        "Current available RAM is below the recommended runtime headroom.",
      );

      score -= 10;
    }

    /*
     * ------------------------------------------------------------------------
     * CPU
     * ------------------------------------------------------------------------
     */

    if (profile.cpu.physicalCores < model.requirements.minimumCpuCores) {
      blockingReasons.push(
        `CPU has fewer than ${model.requirements.minimumCpuCores} physical cores.`,
      );

      score -= 30;
    } else if (
      profile.cpu.physicalCores < model.requirements.recommendedCpuCores
    ) {
      warnings.push("CPU core count is below the recommended level.");

      score -= 5;
    }

    /*
     * ------------------------------------------------------------------------
     * GPU / VRAM
     * ------------------------------------------------------------------------
     */

    if (model.requirements.minimumVramBytes > 0) {
      if (bestVram < model.requirements.minimumVramBytes) {
        if (model.performance.gpuPreferred) {
          warnings.push(
            "The model requires or strongly benefits from GPU acceleration, but sufficient VRAM was not detected.",
          );

          score -= 25;
        }
      } else if (bestVram >= model.requirements.recommendedVramBytes) {
        reasons.push("GPU VRAM meets the recommended requirement.");
      } else {
        warnings.push("GPU VRAM is below the recommended level.");

        score -= 8;
      }
    }

    /*
     * ------------------------------------------------------------------------
     * Acceleration
     * ------------------------------------------------------------------------
     */

    if (model.performance.gpuPreferred) {
      const accelerationAvailable =
        profile.acceleration.cuda.available ||
        profile.acceleration.vulkan.available ||
        profile.acceleration.directml.available ||
        profile.acceleration.metal.available ||
        profile.acceleration.coreML.available;

      if (!accelerationAvailable) {
        warnings.push(
          "No verified GPU acceleration backend is available; CPU execution may be slower.",
        );

        score -= 15;
      } else {
        reasons.push("GPU acceleration capability is available.");
      }
    }

    /*
     * ------------------------------------------------------------------------
     * Storage
     * ------------------------------------------------------------------------
     */

    if (profile.storage.freeBytes < model.requirements.estimatedDiskBytes) {
      blockingReasons.push("Insufficient free disk space for the model.");

      score -= 50;
    } else if (
      profile.storage.freeBytes <
      model.requirements.estimatedDiskBytes * 2
    ) {
      warnings.push(
        "Disk space is sufficient, but low for future model updates.",
      );

      score -= 5;
    }

    /*
     * ------------------------------------------------------------------------
     * Current system load
     * ------------------------------------------------------------------------
     */

    if (profile.load.cpuUsagePercent >= 90) {
      warnings.push("Current CPU load is extremely high.");

      score -= 20;
    } else if (profile.load.cpuUsagePercent >= 75) {
      warnings.push("Current CPU load is high.");

      score -= 10;
    }

    if (profile.load.memoryUsagePercent >= 90) {
      warnings.push("Current memory usage is extremely high.");

      score -= 20;
    } else if (profile.load.memoryUsagePercent >= 80) {
      warnings.push("Current memory usage is high.");

      score -= 10;
    }

    const gpu = getBestGpu(profile);

    if (gpu?.isDiscrete) {
      reasons.push(
        `Discrete GPU detected${gpu.model ? `: ${gpu.model}` : "."}`,
      );
    }

    const finalScore = clamp(score, 0, 100);

    let level: CompatibilityLevel;

    if (blockingReasons.length > 0 || finalScore < 50) {
      level = "incompatible";
    } else if (warnings.length > 0 || finalScore < 80) {
      level = "compatible_with_warning";
    } else {
      level = "compatible";
    }

    return Object.freeze({
      modelId: model.id,
      level,
      score: finalScore,
      reasons,
      warnings,
      blockingReasons,
    });
  }

  public canRun(model: ModelDefinition, profile: HardwareProfile): boolean {
    return this.evaluate(model, profile).level !== "incompatible";
  }

  public isRecommended(
    model: ModelDefinition,
    profile: HardwareProfile,
  ): boolean {
    const result = this.evaluate(model, profile);

    return (
      (result.level === "compatible" ||
        result.level === "compatible_with_warning") &&
      result.score >= 70
    );
  }
}
