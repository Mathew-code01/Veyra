// core/models/installation/ModelInstallationManager.ts

import type { HardwareProfile } from "../../hardware/HardwareProfile";

import type { ModelDefinition } from "../ModelRegistry";

import type { ModelDownloader } from "../ModelDownloader";

import { DiskSpaceGuard } from "./DiskSpaceGuard";

import { MemoryPressureGuard } from "./MemoryPressureGuard";

import {
  buildModelInstallationPlan,
  type ModelInstallationPlan,
} from "./ModelInstallationPlan";

import {
  ModelDownloadQueue,
  type ModelDownloadQueueOptions,
} from "./ModelDownloadQueue";

export interface ModelInstallationManagerOptions {
  readonly queue: ModelDownloadQueue;

  readonly diskSpaceGuard?: DiskSpaceGuard;

  readonly memoryPressureGuard?: MemoryPressureGuard;
}

export interface PrepareModelInstallResult {
  readonly model: ModelDefinition;

  readonly diskSpaceRequiredBytes: number;

  readonly diskSpaceAvailableBytes: number;

  readonly memorySafe: boolean;

  readonly memoryShortfallBytes: number;

  readonly canDownload: boolean;

  readonly canLoadNow: boolean;

  readonly warnings: readonly string[];
}

export class ModelInstallationManager {
  private readonly diskSpaceGuard: DiskSpaceGuard;

  private readonly memoryPressureGuard: MemoryPressureGuard;

  public constructor(
    private readonly options: ModelInstallationManagerOptions,
  ) {
    this.diskSpaceGuard = options.diskSpaceGuard ?? new DiskSpaceGuard();

    this.memoryPressureGuard =
      options.memoryPressureGuard ?? new MemoryPressureGuard();
  }

  public buildPlan(
    profile: HardwareProfile,
    models: readonly ModelDefinition[],
    options: Parameters<typeof buildModelInstallationPlan>[2] = {},
  ): ModelInstallationPlan {
    return buildModelInstallationPlan(profile, models, options);
  }

  public async prepareModel(
    model: ModelDefinition,
    destinationDirectory: string,
  ): Promise<PrepareModelInstallResult> {
    const warnings: string[] = [];

    const estimatedBytes =
      model.artifact?.sizeBytes ?? model.requirements.estimatedDiskBytes;

    const disk = await this.diskSpaceGuard.check(
      destinationDirectory,
      estimatedBytes,
    );

    const memory = this.memoryPressureGuard.inspectModel(model);

    if (!disk.sufficient) {
      warnings.push(
        `Free disk space is insufficient by ${disk.shortfallBytes} bytes.`,
      );
    }

    if (!memory.safe) {
      warnings.push(
        `Current memory availability is insufficient by ${memory.shortfallBytes} bytes for safe loading.`,
      );
    }

    return Object.freeze({
      model,

      diskSpaceRequiredBytes: disk.requiredBytes,

      diskSpaceAvailableBytes: disk.freeBytes,

      memorySafe: memory.safe,

      memoryShortfallBytes: memory.shortfallBytes,

      canDownload: disk.sufficient,

      canLoadNow: disk.sufficient && memory.safe,

      warnings: Object.freeze(warnings),
    });
  }

  public async enqueueModel(
    model: ModelDefinition,
    destinationDirectory: string,
    options: {
      readonly priority?: number;

      readonly requireMemorySafety?: boolean;
    } = {},
  ) {
    const prepared = await this.prepareModel(model, destinationDirectory);

    if (!prepared.canDownload) {
      throw new Error(
        `Cannot download "${model.displayName}" because there is not enough disk space.`,
      );
    }

    if (options.requireMemorySafety === true && !prepared.canLoadNow) {
      throw new Error(
        `Cannot automatically install "${model.displayName}" because current memory pressure is too high.`,
      );
    }

    return this.options.queue.enqueue(
      model.id,
      destinationDirectory,
      options.priority ?? 0,
    );
  }
}
