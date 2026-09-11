// core/models/installation/ModelInstallationManager.ts

import type { HardwareProfile } from "../../hardware/HardwareProfile";

import type { ModelArtifact, ModelDefinition } from "../ModelRegistry";

import type {
  ModelDownloadProgress,
  ModelDownloadResult,
} from "../ModelDownloader";

import {
  ModelPackageDownloader,
  type ModelPackageArtifactDownload,
  type ModelPackageDownloadProgress,
  type ModelPackageDownloadResult,
} from "../ModelPackageDownloader";

import type {
  ModelManifest,
  ModelManifestArtifact,
} from "../storage/ModelManifest";

import { ModelStorage, type StoredModel } from "../storage/ModelStorage";

import { DiskSpaceGuard } from "./DiskSpaceGuard";

import { MemoryPressureGuard } from "./MemoryPressureGuard";

import {
  buildModelInstallationPlan,
  type ModelInstallationPlan,
} from "./ModelInstallationPlan";

import { ModelDownloadQueue } from "./ModelDownloadQueue";

export interface ModelInstallationManagerOptions {
  readonly queue: ModelDownloadQueue;

  readonly storage: ModelStorage;

  readonly packageDownloader?: ModelPackageDownloader;

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

  /**
   * Primary model artifact.
   *
   * Kept for compatibility with ModelManager.
   */
  readonly download: ModelDownloadResult;

  /**
   * Complete package result.
   */
  readonly packageDownload: ModelPackageDownloadResult;

  readonly manifest: ModelManifest;

  readonly storedModel: StoredModel;

  readonly queuedItemId: string | null;

  readonly alreadyInstalled: boolean;
}

export interface InstallModelOptions {
  readonly priority?: number;

  readonly requireMemorySafety?: boolean;

  readonly signal?: AbortSignal;

  readonly overwrite?: boolean;

  readonly onProgress?: (progress: ModelDownloadProgress) => void;

  readonly onPackageProgress?: (progress: ModelPackageDownloadProgress) => void;
}

function assertPackage(
  model: ModelDefinition,
): NonNullable<ModelDefinition["package"]> {
  if (!model.package) {
    throw new Error(
      `Model "${model.id}" does not have a downloadable package.`,
    );
  }

  return model.package;
}

export class ModelInstallationManager {
  private readonly diskSpaceGuard: DiskSpaceGuard;

  private readonly memoryPressureGuard: MemoryPressureGuard;

  private readonly packageDownloader: ModelPackageDownloader;

  private readonly storage: ModelStorage;

  private readonly queue: ModelDownloadQueue;

  public constructor(
    private readonly options: ModelInstallationManagerOptions,
  ) {
    this.storage = options.storage;

    this.queue = options.queue;

    this.packageDownloader =
      options.packageDownloader ?? new ModelPackageDownloader();

    this.diskSpaceGuard = options.diskSpaceGuard ?? new DiskSpaceGuard();

    this.memoryPressureGuard =
      options.memoryPressureGuard ?? new MemoryPressureGuard();
  }

  public getStorage(): ModelStorage {
    return this.storage;
  }

  public getQueue(): ModelDownloadQueue {
    return this.queue;
  }

  public getPackageDownloader(): ModelPackageDownloader {
    return this.packageDownloader;
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

    const modelPackage = model.package;

    if (!modelPackage) {
      return Object.freeze({
        model,

        diskSpaceRequiredBytes: model.requirements.estimatedDiskBytes,

        diskSpaceAvailableBytes: 0,

        memorySafe: false,

        memoryShortfallBytes: 0,

        canDownload: false,

        canLoadNow: false,

        warnings: Object.freeze([
          "No downloadable package is configured for this model.",
        ]),
      });
    }

    const packageBytes = modelPackage.artifacts.reduce(
      (total: number, artifact: ModelArtifact) => total + artifact.sizeBytes,
      0,
    );

    const estimatedBytes = Math.max(
      packageBytes,
      model.requirements.estimatedDiskBytes,
    );

    await this.storage.createModelDirectory(model);

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
        "Current memory availability is insufficient. The model can remain downloaded, but Veyra should not load it until enough memory is available.",
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

  /**
   * Legacy single-item queue entry point.
   *
   * Complete packages are installed by
   * ModelPackageDownloader through installModel().
   */
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

    return this.queue.enqueue(
      model.id,
      destinationDirectory,
      options.priority ?? 0,
    );
  }

  /**
   * Return a verified persistent installation.
   *
   * Never downloads.
   */
  public async getInstalledModel(
    model: ModelDefinition,
  ): Promise<StoredModel | null> {
    await this.storage.initialize();

    return this.storage.getStoredModel(model);
  }

  /**
   * Complete production package installation.
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

    /*
     * Validate that a package exists.
     *
     * The returned variable is intentionally
     * not retained because the actual package
     * downloader validates the package again.
     */
    assertPackage(model);

    if (options.signal?.aborted) {
      throw new DOMException("Model installation was aborted.", "AbortError");
    }

    await this.storage.initialize();

    /*
     * Never redownload a package that is already
     * verified and persisted.
     */
    const existing = await this.storage.getStoredModel(model);

    if (existing) {
      return Object.freeze({
        model,

        download: this.createDownloadResultFromStoredModel(existing),

        packageDownload:
          this.createPackageDownloadResultFromStoredModel(existing),

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

    if (options.overwrite) {
      await this.storage.remove(model);

      await this.storage.createModelDirectory(model);
    }

    /*
     * PackageDownloader owns the complete
     * multi-artifact installation.
     */
    const packageDownload = await this.packageDownloader.download(model, {
      destinationDirectory: modelDirectory,

      overwrite: options.overwrite,

      signal: options.signal,

      keepPartialOnAbort: true,

      onProgress: (progress: ModelPackageDownloadProgress) => {
        /*
         * Always expose package progress.
         */
        options.onPackageProgress?.(progress);

        /*
         * ModelManager still expects the
         * legacy ModelDownloadProgress shape.
         *
         * Do not attempt to inspect
         * primaryArtifactId here because
         * ModelPackageDownloadProgress does
         * not contain that property.
         */
        options.onProgress?.(
          Object.freeze({
            modelId: progress.modelId,

            filename: progress.filename,

            bytesDownloaded: progress.bytesDownloaded,

            totalBytes: progress.totalBytes,

            percentage: progress.percentage,

            speedBytesPerSecond: progress.speedBytesPerSecond,

            resumed: progress.resumed,

            phase: progress.phase,
          }),
        );
      },
    });

    /*
     * All package artifacts have now been
     * downloaded and individually verified.
     *
     * Storage creates the persistent manifest
     * and performs the final package-level
     * integrity validation.
     */
    const manifest = await this.storage.registerInstalledPackage(
      model,
      packageDownload,
    );

    const stored = await this.storage.getStoredModel(model);

    if (!stored) {
      await this.storage.markCorrupt(model);

      throw new Error(
        `Model "${model.id}" was downloaded but failed final package integrity verification.`,
      );
    }

    return Object.freeze({
      model,

      download: packageDownload.primaryArtifact.result,

      packageDownload,

      manifest,

      storedModel: stored,

      queuedItemId: null,

      alreadyInstalled: false,
    });
  }

  private createDownloadResultFromStoredModel(
    stored: StoredModel,
  ): ModelDownloadResult {
    const primary = stored.manifest.package.artifacts.find(
      (artifact: ModelManifestArtifact) =>
        artifact.id === stored.manifest.package.primaryArtifactId,
    );

    if (!primary) {
      throw new Error(
        `Stored model "${stored.modelId}" has no primary artifact.`,
      );
    }

    return Object.freeze({
      modelId: stored.modelId,

      artifactId: primary.id,

      filename: primary.filename,

      filePath: primary.filePath,

      bytesDownloaded: primary.sizeBytes,

      sha256: primary.sha256,

      resumed: false,

      attempts: 0,
    });
  }

  private createPackageDownloadResultFromStoredModel(
    stored: StoredModel,
  ): ModelPackageDownloadResult {
    const artifacts: ModelPackageArtifactDownload[] =
      stored.manifest.package.artifacts.map((artifact: ModelManifestArtifact) =>
        Object.freeze({
          artifact: Object.freeze({
            id: artifact.id,

            url: "",

            filename: artifact.filename,

            sizeBytes: artifact.sizeBytes,

            sha256: artifact.sha256,

            role: artifact.role,
          }),

          result: Object.freeze({
            modelId: stored.modelId,

            artifactId: artifact.id,

            filename: artifact.filename,

            filePath: artifact.filePath,

            bytesDownloaded: artifact.sizeBytes,

            sha256: artifact.sha256,

            resumed: false,

            attempts: 0,
          }),
        }),
      );

    const primaryArtifact = artifacts.find(
      (item: ModelPackageArtifactDownload) =>
        item.artifact.id === stored.manifest.package.primaryArtifactId,
    );

    if (!primaryArtifact) {
      throw new Error(
        `Stored model "${stored.modelId}" has no primary package artifact.`,
      );
    }

    return Object.freeze({
      modelId: stored.modelId,

      artifacts: Object.freeze(artifacts),

      primaryArtifact,

      totalBytesDownloaded: artifacts.reduce(
        (total: number, item: ModelPackageArtifactDownload) =>
          total + item.result.bytesDownloaded,
        0,
      ),

      totalBytesExpected: stored.manifest.package.totalSizeBytes,

      resumed: false,

      attempts: 0,
    });
  }
}
