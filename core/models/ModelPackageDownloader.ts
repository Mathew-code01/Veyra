// core/models/ModelPackageDownloader.ts

import type { ModelArtifact, ModelDefinition } from "./ModelRegistry";

import {
  ModelDownloader,
  type ModelDownloadOptions,
  type ModelDownloadProgress,
  type ModelDownloadResult,
} from "./ModelDownloader";

export interface ModelPackageDownloadProgress extends Omit<
  ModelDownloadProgress,
  "filename"
> {
  /**
   * Currently downloading artifact.
   */
  readonly artifactId: string;

  /**
   * Current artifact filename.
   */
  readonly filename: string;

  /**
   * Aggregate package progress.
   */
  readonly packageBytesDownloaded: number;

  /**
   * Aggregate expected package size.
   */
  readonly packageTotalBytes: number;

  /**
   * Aggregate package percentage.
   */
  readonly packagePercentage: number;

  /**
   * Number of artifacts already completed.
   */
  readonly completedArtifacts: number;

  /**
   * Total artifacts in the package.
   */
  readonly totalArtifacts: number;
}

export interface ModelPackageDownloadOptions {
  readonly destinationDirectory: string;

  readonly overwrite?: boolean;

  readonly signal?: AbortSignal;

  readonly keepPartialOnAbort?: boolean;

  readonly onProgress?: (progress: ModelPackageDownloadProgress) => void;

  readonly maxRetries?: number;

  readonly retryBaseDelayMs?: number;

  readonly retryMaxDelayMs?: number;

  readonly requestTimeoutMs?: number;

  readonly diskCheckIntervalMs?: number;

  readonly diskSafetyBufferBytes?: number;
}

export interface ModelPackageArtifactDownload {
  readonly artifact: ModelArtifact;

  readonly result: ModelDownloadResult;
}

export interface ModelPackageDownloadResult {
  readonly modelId: string;

  readonly artifacts: readonly ModelPackageArtifactDownload[];

  readonly primaryArtifact: ModelPackageArtifactDownload;

  readonly totalBytesDownloaded: number;

  readonly totalBytesExpected: number;

  readonly resumed: boolean;

  readonly attempts: number;
}

function assertUniqueArtifactIds(
  model: ModelDefinition,
  artifacts: readonly ModelArtifact[],
): void {
  const ids = new Set<string>();

  for (const artifact of artifacts) {
    const id = artifact.id.trim();

    if (!id) {
      throw new Error(
        `Model "${model.id}" contains an artifact with an empty id.`,
      );
    }

    if (ids.has(id)) {
      throw new Error(
        `Model "${model.id}" contains duplicate artifact id "${id}".`,
      );
    }

    ids.add(id);
  }
}

function validatePackage(model: ModelDefinition): {
  readonly artifacts: readonly ModelArtifact[];

  readonly requiredArtifactIds: readonly string[];
} {
  const modelPackage = model.package;

  if (!modelPackage) {
    throw new Error(
      `Model "${model.id}" does not define an installable package.`,
    );
  }

  if (modelPackage.artifacts.length === 0) {
    throw new Error(`Model "${model.id}" has an empty model package.`);
  }

  assertUniqueArtifactIds(model, modelPackage.artifacts);

  const artifactIds = new Set(
    modelPackage.artifacts.map((artifact) => artifact.id),
  );

  const requiredIds = [
    ...new Set(modelPackage.requiredArtifactIds.map((id) => id.trim())),
  ];

  if (requiredIds.length === 0) {
    throw new Error(
      `Model "${model.id}" does not define required package artifacts.`,
    );
  }

  for (const requiredId of requiredIds) {
    if (!artifactIds.has(requiredId)) {
      throw new Error(
        `Model "${model.id}" requires artifact "${requiredId}", but that artifact is not declared in the package.`,
      );
    }
  }

  return Object.freeze({
    artifacts: modelPackage.artifacts,
    requiredArtifactIds: Object.freeze(requiredIds),
  });
}

function findPrimaryArtifact(
  model: ModelDefinition,
  artifacts: readonly ModelArtifact[],
): ModelArtifact {
  const modelArtifact = artifacts.find((artifact) => artifact.role === "model");

  if (!modelArtifact) {
    throw new Error(
      `Model "${model.id}" package does not contain an artifact with role "model".`,
    );
  }

  return modelArtifact;
}

export class ModelPackageDownloader {
  private readonly downloader: ModelDownloader;

  public constructor(downloader: ModelDownloader = new ModelDownloader()) {
    this.downloader = downloader;
  }

  public getDownloader(): ModelDownloader {
    return this.downloader;
  }

  public async download(
    model: ModelDefinition,
    options: ModelPackageDownloadOptions,
  ): Promise<ModelPackageDownloadResult> {
    const packageDefinition = validatePackage(model);

    const artifacts = [...packageDefinition.artifacts];

    const primaryArtifact = findPrimaryArtifact(model, artifacts);

    const totalArtifacts = artifacts.length;

    const packageTotalBytes = artifacts.reduce(
      (total, artifact) => total + Math.max(0, artifact.sizeBytes),
      0,
    );

    let packageBytesDownloaded = 0;

    let completedArtifacts = 0;

    let totalAttempts = 0;

    let anyResumed = false;

    const downloaded: ModelPackageArtifactDownload[] = [];

    for (const artifact of artifacts) {
      this.throwIfAborted(model.id, options.signal);

      const artifactStartedBytes = packageBytesDownloaded;

      const progressOptions: ModelDownloadOptions = {
        destinationDirectory: options.destinationDirectory,

        overwrite: options.overwrite,

        signal: options.signal,

        keepPartialOnAbort: options.keepPartialOnAbort,

        maxRetries: options.maxRetries,

        retryBaseDelayMs: options.retryBaseDelayMs,

        retryMaxDelayMs: options.retryMaxDelayMs,

        requestTimeoutMs: options.requestTimeoutMs,

        diskCheckIntervalMs: options.diskCheckIntervalMs,

        diskSafetyBufferBytes: options.diskSafetyBufferBytes,

        onProgress: (progress) => {
          const currentArtifactBytes = Math.max(
            0,
            progress.bytesDownloaded - artifactStartedBytes,
          );

          const aggregateBytes = Math.min(
            packageTotalBytes,
            packageBytesDownloaded + currentArtifactBytes,
          );

          const packagePercentage =
            packageTotalBytes > 0
              ? Math.min(
                  100,
                  Math.max(0, (aggregateBytes / packageTotalBytes) * 100),
                )
              : 0;

          options.onProgress?.(
            Object.freeze({
              modelId: progress.modelId,

              artifactId: artifact.id,

              filename: progress.filename,

              bytesDownloaded: progress.bytesDownloaded,

              totalBytes: progress.totalBytes,

              percentage: progress.percentage,

              speedBytesPerSecond: progress.speedBytesPerSecond,

              resumed: progress.resumed,

              phase: progress.phase,

              packageBytesDownloaded: aggregateBytes,

              packageTotalBytes,

              packagePercentage,

              completedArtifacts,

              totalArtifacts,
            }),
          );
        },
      };

      const result = await this.downloader.downloadArtifact(
        model.id,
        artifact,
        progressOptions,
      );

      downloaded.push(
        Object.freeze({
          artifact,
          result,
        }),
      );

      packageBytesDownloaded += result.bytesDownloaded;

      totalAttempts += result.attempts;

      anyResumed = anyResumed || result.resumed;

      completedArtifacts += 1;

      options.onProgress?.(
        Object.freeze({
          modelId: model.id,

          artifactId: artifact.id,

          filename: artifact.filename,

          bytesDownloaded: result.bytesDownloaded,

          totalBytes: artifact.sizeBytes,

          percentage: 100,

          speedBytesPerSecond: 0,

          resumed: result.resumed,

          phase: "completed",

          packageBytesDownloaded,

          packageTotalBytes,

          packagePercentage:
            packageTotalBytes > 0
              ? Math.min(
                  100,
                  (packageBytesDownloaded / packageTotalBytes) * 100,
                )
              : 100,

          completedArtifacts,

          totalArtifacts,
        }),
      );
    }

    const primaryDownload = downloaded.find(
      ({ artifact }) => artifact.id === primaryArtifact.id,
    );

    if (!primaryDownload) {
      throw new Error(
        `Primary artifact "${primaryArtifact.id}" was not downloaded for model "${model.id}".`,
      );
    }

    return Object.freeze({
      modelId: model.id,

      artifacts: Object.freeze(downloaded),

      primaryArtifact: primaryDownload,

      totalBytesDownloaded: packageBytesDownloaded,

      totalBytesExpected: packageTotalBytes,

      resumed: anyResumed,

      attempts: totalAttempts,
    });
  }

  private throwIfAborted(modelId: string, signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException(
        `Installation of "${modelId}" was aborted.`,
        "AbortError",
      );
    }
  }
}
