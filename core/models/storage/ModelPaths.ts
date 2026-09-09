// core/models/storage/ModelPaths.ts

import path from "node:path";

import type { ModelModality } from "../ModelRegistry";

export interface ModelPathsOptions {
  readonly applicationDataDirectory: string;
}

export class ModelPaths {
  private readonly rootDirectory: string;

  public constructor(options: ModelPathsOptions) {
    const applicationDataDirectory = options.applicationDataDirectory.trim();

    if (!applicationDataDirectory) {
      throw new Error(
        "ModelPaths requires a valid application data directory.",
      );
    }

    this.rootDirectory = path.resolve(applicationDataDirectory);
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
      "manifest.json",
    );
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
    return `${this.getArtifactPath(modality, modelId, filename)}.part`;
  }

  public getRuntimeDirectory(runtime: string): string {
    this.assertSafeSegment(runtime);

    return path.join(this.rootDirectory, "runtimes", runtime);
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
