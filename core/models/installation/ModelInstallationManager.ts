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

import {
  MemoryPressureGuard,
  type MemoryPressureResult,
} from "./MemoryPressureGuard";

import {
  buildModelInstallationPlan,
  type ModelInstallationPlan,
} from "./ModelInstallationPlan";

import { ModelDownloadQueue } from "./ModelDownloadQueue";

/**
 * ============================================================================
 * Configuration
 * ============================================================================
 */

export interface ModelInstallationManagerOptions {
  readonly queue: ModelDownloadQueue;

  readonly storage: ModelStorage;

  readonly packageDownloader?: ModelPackageDownloader;

  readonly diskSpaceGuard?: DiskSpaceGuard;

  readonly memoryPressureGuard?: MemoryPressureGuard;
}

/**
 * ============================================================================
 * Preparation
 * ============================================================================
 */

export interface PrepareModelInstallResult {
  readonly model: ModelDefinition;

  readonly diskSpaceRequiredBytes: number;

  readonly diskSpaceAvailableBytes: number;

  /**
   * Whether the model can currently be loaded into memory.
   *
   * This does NOT determine whether downloading is allowed.
   */
  readonly memorySafe: boolean;

  readonly memoryShortfallBytes: number;

  readonly memory: MemoryPressureResult;

  /**
   * Whether the package can be downloaded.
   *
   * This is primarily controlled by disk capacity.
   */
  readonly canDownload: boolean;

  /**
   * Whether the model can be loaded right now.
   */
  readonly canLoadNow: boolean;

  readonly warnings: readonly string[];
}

/**
 * ============================================================================
 * Installation result
 * ============================================================================
 */

export interface ModelInstallationResult {
  readonly model: ModelDefinition;

  readonly download: ModelDownloadResult;

  readonly packageDownload: ModelPackageDownloadResult;

  readonly manifest: ModelManifest;

  readonly storedModel: StoredModel;

  readonly queuedItemId: string | null;

  readonly alreadyInstalled: boolean;

  /**
   * Memory status at installation time.
   *
   * This is diagnostic information only.
   *
   * A false value does NOT mean installation failed.
   */
  readonly memorySafeAtInstall: boolean;

  readonly memoryWarnings: readonly string[];
}

/**
 * ============================================================================
 * Options
 * ============================================================================
 */

export interface InstallModelOptions {
  readonly priority?: number;

  /**
   * Legacy compatibility option.
   *
   * Installation itself should normally not be blocked by RAM because the
   * package download is not the same operation as loading the model.
   *
   * Runtime loading remains protected by ModelRuntimeManager.
   *
   * If true, the caller explicitly requests a pre-install memory check.
   * The check is reported through the result/warnings but does not prevent
   * downloading.
   */
  readonly requireMemorySafety?: boolean;

  readonly signal?: AbortSignal;

  readonly overwrite?: boolean;

  readonly onProgress?: (progress: ModelDownloadProgress) => void;

  readonly onPackageProgress?: (progress: ModelPackageDownloadProgress) => void;
}

/**
 * ============================================================================
 * Helpers
 * ============================================================================
 */

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

/**
 * ============================================================================
 * ModelInstallationManager
 * ============================================================================
 */

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

  // ==========================================================================
  // Accessors
  // ==========================================================================

  public getStorage(): ModelStorage {
    return this.storage;
  }

  public getQueue(): ModelDownloadQueue {
    return this.queue;
  }

  public getPackageDownloader(): ModelPackageDownloader {
    return this.packageDownloader;
  }

  // ==========================================================================
  // Planning
  // ==========================================================================

  public buildPlan(
    profile: HardwareProfile,
    models: readonly ModelDefinition[],
    options: Parameters<typeof buildModelInstallationPlan>[2] = {},
  ): ModelInstallationPlan {
    return buildModelInstallationPlan(profile, models, options);
  }

  // ==========================================================================
  // Preparation
  // ==========================================================================

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

        memory: this.memoryPressureGuard.inspect(0),

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
        `Insufficient disk space. Veyra needs ${disk.requiredBytes} bytes including the storage safety margin, but only ${disk.freeBytes} bytes are available.`,
      );
    }

    /*
     * Memory does not block downloading.
     *
     * The model may safely remain installed on disk and become loadable later
     * when the user closes applications or otherwise frees memory.
     */
    if (!memory.safe) {
      warnings.push(
        `The model is not safe to load right now. ` +
          `${memory.shortfallBytes} bytes of additional effective memory are required. ` +
          `The model can still be downloaded and installed.`,
      );
    }

    if (memory.availablePercent < 25) {
      warnings.push(
        `System memory is currently under pressure (${memory.availablePercent.toFixed(1)}% available).`,
      );
    }

    return Object.freeze({
      model,

      diskSpaceRequiredBytes: disk.requiredBytes,

      diskSpaceAvailableBytes: disk.freeBytes,

      memorySafe: memory.safe,

      memoryShortfallBytes: memory.shortfallBytes,

      memory,

      canDownload: disk.sufficient,

      canLoadNow: disk.sufficient && memory.safe,

      warnings: Object.freeze(warnings),
    });
  }

  // ==========================================================================
  // Legacy queue entry point
  // ==========================================================================

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

    /*
     * IMPORTANT:
     *
     * Memory is intentionally not a download blocker.
     *
     * Even when requireMemorySafety is true, the model can still be downloaded.
     * Runtime loading will independently enforce memory safety.
     *
     * This prevents the old situation where a machine with enough available
     * RAM was incorrectly prevented from installing a model simply because
     * Veyra had reserved a fixed 2 GB.
     */
    if (options.requireMemorySafety === true && !prepared.memorySafe) {
      /*
       * Intentionally continue.
       *
       * The queue represents package acquisition, not model execution.
       */
    }

    return this.queue.enqueue(
      model.id,
      destinationDirectory,
      options.priority ?? 0,
    );
  }

  // ==========================================================================
  // Installed model lookup
  // ==========================================================================

  public async getInstalledModel(
    model: ModelDefinition,
  ): Promise<StoredModel | null> {
    await this.storage.initialize();

    return this.storage.getStoredModel(model);
  }

  // ==========================================================================
  // Complete installation
  // ==========================================================================

  public async installModel(
    model: ModelDefinition,
    options: InstallModelOptions = {},
  ): Promise<ModelInstallationResult> {
    if (model.availability !== "available") {
      throw new Error(
        `Model "${model.id}" is not currently available for installation.`,
      );
    }

    assertPackage(model);

    if (options.signal?.aborted) {
      throw new DOMException("Model installation was aborted.", "AbortError");
    }

    await this.storage.initialize();

    /*
     * Never redownload a verified installation.
     */
    const existing = await this.storage.getStoredModel(model);

    if (existing) {
      const memory = this.memoryPressureGuard.inspectModel(model);

      return Object.freeze({
        model,

        download: this.createDownloadResultFromStoredModel(existing),

        packageDownload:
          this.createPackageDownloadResultFromStoredModel(existing),

        manifest: existing.manifest,

        storedModel: existing,

        queuedItemId: null,

        alreadyInstalled: true,

        memorySafeAtInstall: memory.safe,

        memoryWarnings: Object.freeze(
          memory.safe
            ? []
            : [
                `Model is installed but cannot currently be loaded safely. ` +
                  `${memory.shortfallBytes} bytes of additional effective memory are required.`,
              ],
        ),
      });
    }

    const modelDirectory = this.storage.getModelDirectory(model);

    await this.storage.createModelDirectory(model);

    const prepared = await this.prepareModel(model, modelDirectory);

    /*
     * Disk space is a hard installation requirement.
     */
    if (!prepared.canDownload) {
      throw new Error(
        `Cannot install "${model.displayName}" because there is insufficient disk space. ` +
          `Required: ${prepared.diskSpaceRequiredBytes} bytes. ` +
          `Available: ${prepared.diskSpaceAvailableBytes} bytes.`,
      );
    }

    /*
     * Memory is intentionally NOT a hard installation requirement.
     *
     * This is the central fix.
     *
     * The package is downloaded, verified and persisted.
     * ModelRuntimeManager is responsible for deciding whether it can be
     * loaded into RAM at the moment the user actually wants inference.
     */
    const packageDownload = await this.packageDownloader.download(model, {
      destinationDirectory: modelDirectory,

      overwrite: options.overwrite,

      signal: options.signal,

      keepPartialOnAbort: true,

      onProgress: (progress: ModelPackageDownloadProgress) => {
        options.onPackageProgress?.(progress);

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
     * Register package and perform final integrity verification.
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

    /*
     * Re-profile memory after installation.
     *
     * This is useful because the system may have changed while the package
     * was downloading.
     */
    const memoryAfterInstall = this.memoryPressureGuard.inspectModel(model);

    return Object.freeze({
      model,

      download: packageDownload.primaryArtifact.result,

      packageDownload,

      manifest,

      storedModel: stored,

      queuedItemId: null,

      alreadyInstalled: false,

      memorySafeAtInstall: memoryAfterInstall.safe,

      memoryWarnings: Object.freeze(
        memoryAfterInstall.safe
          ? []
          : [
              `Model installed successfully, but it should not be loaded yet. ` +
                `${memoryAfterInstall.shortfallBytes} bytes of additional effective memory are required.`,
            ],
      ),
    });
  }

  // ==========================================================================
  // Stored-model compatibility helpers
  // ==========================================================================

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
