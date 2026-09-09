// core/models/installation/ModelInstallationManager.ts

import type { HardwareProfile } from "../../hardware/HardwareProfile";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  ModelDownloadResult,
  ModelDownloadProgress,
} from "../ModelDownloader";

import { ModelStorage, type StoredModel } from "../storage/ModelStorage";

import { DiskSpaceGuard } from "./DiskSpaceGuard";

import { MemoryPressureGuard } from "./MemoryPressureGuard";

import {
  buildModelInstallationPlan,
  type ModelInstallationPlan,
} from "./ModelInstallationPlan";

import { ModelDownloadQueue } from "./ModelDownloadQueue";

import type { ModelManifest } from "../storage/ModelManifest";

export interface ModelInstallationManagerOptions {
  readonly queue: ModelDownloadQueue;

  readonly storage: ModelStorage;

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

export interface ModelInstallationResult {
  readonly model: ModelDefinition;

  readonly download: ModelDownloadResult;

  readonly manifest: ModelManifest;

  readonly storedModel: StoredModel;

  readonly queuedItemId: string | null;

  readonly alreadyInstalled: boolean;
}

export interface InstallModelOptions {
  readonly priority?: number;

  readonly requireMemorySafety?: boolean;

  readonly signal?: AbortSignal;

  readonly onProgress?: (progress: ModelDownloadProgress) => void;
}

export class ModelInstallationManager {
  private readonly diskSpaceGuard: DiskSpaceGuard;

  private readonly memoryPressureGuard: MemoryPressureGuard;

  private readonly storage: ModelStorage;

  public constructor(
    private readonly options: ModelInstallationManagerOptions,
  ) {
    this.diskSpaceGuard = options.diskSpaceGuard ?? new DiskSpaceGuard();

    this.memoryPressureGuard =
      options.memoryPressureGuard ?? new MemoryPressureGuard();

    this.storage = options.storage;
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

    if (!model.artifact) {
      return Object.freeze({
        model,

        diskSpaceRequiredBytes: model.requirements.estimatedDiskBytes,

        diskSpaceAvailableBytes: 0,

        memorySafe: false,

        memoryShortfallBytes: 0,

        canDownload: false,

        canLoadNow: false,

        warnings: Object.freeze([
          "No downloadable artifact is configured for this model.",
        ]),
      });
    }

    const estimatedBytes = Math.max(
      model.artifact.sizeBytes ?? 0,

      model.requirements.estimatedDiskBytes,
    );

    const disk = await this.diskSpaceGuard.check(
      destinationDirectory,
      estimatedBytes,
    );

    const memory = this.memoryPressureGuard.inspectModel(model);

    if (!disk.sufficient) {
      warnings.push(
        `Insufficient disk space. Veyra needs ${disk.requiredBytes} bytes including safety margin, but only ${disk.freeBytes} bytes are available.`,
      );
    }

    if (!memory.safe) {
      warnings.push(
        `Current memory availability is insufficient. The model can remain downloaded, but Veyra should not load it until enough memory is available.`,
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
  ): Promise<Awaited<ReturnType<ModelDownloadQueue["enqueue"]>>> {
    const prepared = await this.prepareModel(model, destinationDirectory);

    if (!prepared.canDownload) {
      throw new Error(
        `Cannot download "${model.displayName}" because there is insufficient disk space.`,
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

  /**
   * Complete production installation.
   *
   * Flow:
   *
   * prepare
   *   ↓
   * model directory
   *   ↓
   * queue
   *   ↓
   * download
   *   ↓
   * verify
   *   ↓
   * manifest
   *   ↓
   * persistent installed model
   */
  public async installModel(
    model: ModelDefinition,
    options: InstallModelOptions = {},
  ): Promise<ModelInstallationResult> {
    if (model.availability !== "available") {
      throw new Error(
        `Model "${model.id}" is not currently available for installation.`,
      );
    }

    if (!model.artifact) {
      throw new Error(
        `Model "${model.id}" does not have a downloadable artifact.`,
      );
    }

    if (options.signal?.aborted) {
      throw new DOMException("Model installation was aborted.", "AbortError");
    }

    await this.storage.initialize();

    /*
     * If the model is already installed and
     * integrity verification passes, never
     * download it again.
     */
    const existing = await this.storage.getStoredModel(model);

    if (existing) {
      return Object.freeze({
        model,

        download: this.createDownloadResultFromStoredModel(model, existing),

        manifest: existing.manifest,

        storedModel: existing,

        queuedItemId: null,

        alreadyInstalled: true,
      });
    }

    const modelDirectory = this.storage.getModelDirectory(model);

    await this.storage.createModelDirectory(model);

    const prepared = await this.prepareModel(model, modelDirectory);

    if (!prepared.canDownload) {
      throw new Error(
        `Cannot install "${model.displayName}" because there is insufficient disk space.`,
      );
    }

    if (options.requireMemorySafety === true && !prepared.canLoadNow) {
      throw new Error(
        `Cannot install "${model.displayName}" because current memory pressure is too high.`,
      );
    }

    const item = await this.enqueueModel(model, modelDirectory, {
      priority: options.priority ?? 0,

      requireMemorySafety: options.requireMemorySafety ?? false,
    });

    const progressHandler = options.onProgress;

    /*
     * The queue owns the download and emits
     * its progress through its configured
     * callback.
     *
     * Installation cancellation is handled
     * by queue cancellation/controller support.
     */
    void progressHandler;

    if (options.signal) {
      options.signal.addEventListener(
        "abort",
        () => {
          void this.options.queue.cancel(item.id).catch(() => undefined);
        },
        {
          once: true,
        },
      );
    }

    const completed = await this.options.queue.waitForCompletion(item.id);

    if (completed.state !== "completed") {
      throw new Error(`Model "${model.id}" did not complete installation.`);
    }

    const download = this.options.queue.getResult(item.id);

    if (!download) {
      throw new Error(
        `Model "${model.id}" completed downloading, but the download result could not be recovered.`,
      );
    }

    /*
     * Register the verified artifact in
     * persistent model storage.
     */
    const manifest = await this.storage.registerInstalledModel(model, download);

    /*
     * Verify the complete installation
     * one more time after writing the manifest.
     */
    const stored = await this.storage.getStoredModel(model);

    if (!stored) {
      throw new Error(
        `Model "${model.id}" was downloaded but failed final storage verification.`,
      );
    }

    return Object.freeze({
      model,

      download,

      manifest,

      storedModel: stored,

      queuedItemId: item.id,

      alreadyInstalled: false,
    });
  }

  private createDownloadResultFromStoredModel(
    model: ModelDefinition,
    stored: StoredModel,
  ): ModelDownloadResult {
    return Object.freeze({
      modelId: model.id,

      filename: stored.manifest.artifact.filename,

      filePath: stored.artifactPath,

      bytesDownloaded: stored.manifest.artifact.sizeBytes,

      sha256: stored.manifest.artifact.sha256,

      resumed: false,

      attempts: 0,
    });
  }
}
