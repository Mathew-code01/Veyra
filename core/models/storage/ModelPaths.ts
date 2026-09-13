// core/models/storage/ModelPaths.ts

import path from "node:path";

import type { ModelModality } from "../ModelRegistry";

const MANIFEST_FILENAME = "manifest.json";

const PART_SUFFIX = ".part";

const MANIFEST_TEMP_SUFFIX = ".tmp";

const LOCK_FILENAME = ".operation.lock";

export interface ModelPathsOptions {
  readonly applicationDataDirectory: string;
}

export class ModelPaths {
  private readonly rootDirectory: string;

  public constructor(options: ModelPathsOptions) {
    const directory = options.applicationDataDirectory.trim();

    if (!directory) {
      throw new Error(
        "ModelPaths requires a valid application data directory.",
      );
    }

    this.rootDirectory = path.resolve(directory);
  }

  public getRootDirectory(): string {
    return this.rootDirectory;
  }

  public getModelsDirectory(): string {
    return path.join(this.rootDirectory, "models");
  }

  public getModalityDirectory(modality: ModelModality): string {
    this.assertSafeSegment(modality);

    return path.join(this.getModelsDirectory(), modality);
  }

  public getModelDirectory(modality: ModelModality, modelId: string): string {
    this.assertSafeSegment(modality);

    this.assertSafeSegment(modelId);

    return path.join(this.getModalityDirectory(modality), modelId);
  }

  public getManifestPath(modality: ModelModality, modelId: string): string {
    return path.join(
      this.getModelDirectory(modality, modelId),
      MANIFEST_FILENAME,
    );
  }

  public getManifestTempPath(modality: ModelModality, modelId: string): string {
    return `${this.getManifestPath(modality, modelId)}${MANIFEST_TEMP_SUFFIX}`;
  }

  public getArtifactPath(
    modality: ModelModality,
    modelId: string,
    filename: string,
  ): string {
    this.assertSafeFilename(filename);

    return path.join(this.getModelDirectory(modality, modelId), filename);
  }

  public getPartialArtifactPath(
    modality: ModelModality,
    modelId: string,
    filename: string,
  ): string {
    return `${this.getArtifactPath(modality, modelId, filename)}${PART_SUFFIX}`;
  }

  public getOperationLockPath(
    modality: ModelModality,
    modelId: string,
  ): string {
    return path.join(this.getModelDirectory(modality, modelId), LOCK_FILENAME);
  }

  public getRuntimeDirectory(runtime: string): string {
    this.assertSafeSegment(runtime);

    return path.join(this.rootDirectory, "runtimes", runtime);
  }

  public getRuntimeVersionDirectory(runtime: string, version: string): string {
    this.assertSafeSegment(runtime);
    this.assertSafeSegment(version);

    return path.join(this.getRuntimeDirectory(runtime), version);
  }

  public getRuntimeManifestPath(runtime: string, version: string): string {
    return path.join(
      this.getRuntimeVersionDirectory(runtime, version),
      "runtime-manifest.json",
    );
  }

  public getRuntimeExecutablePath(
    runtime: string,
    version: string,
    executableFilename: string,
  ): string {
    this.assertSafeFilename(executableFilename);

    return path.join(
      this.getRuntimeVersionDirectory(runtime, version),
      executableFilename,
    );
  }

  public getCacheDirectory(): string {
    return path.join(this.rootDirectory, "cache");
  }

  public getBenchmarkDirectory(): string {
    return path.join(this.rootDirectory, "benchmarks");
  }

  public getInstallationDirectory(): string {
    return path.join(this.rootDirectory, "installation");
  }

  public getDownloadQueueStatePath(): string {
    return path.join(this.getInstallationDirectory(), "download-queue.json");
  }

  public getRecoveryDirectory(): string {
    return path.join(this.getInstallationDirectory(), "recovery");
  }

  private assertSafeSegment(value: string): void {
    if (
      !value ||
      value === "." ||
      value === ".." ||
      value.includes("/") ||
      value.includes("\\") ||
      value.includes("\0")
    ) {
      throw new Error(`Unsafe filesystem path segment: "${value}".`);
    }
  }

  private assertSafeFilename(value: string): void {
    this.assertSafeSegment(value);

    if (value.endsWith(".") || value.endsWith(" ")) {
      throw new Error(`Unsafe filename: "${value}".`);
    }
  }
}
