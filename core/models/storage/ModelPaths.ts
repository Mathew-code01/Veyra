// core/models/storage/ModelPaths.ts

import path from "node:path";

import type { ModelModality } from "../ModelRegistry";

export interface ModelPathsOptions {
  readonly applicationDataDirectory: string;
}

export class ModelPaths {
  private readonly rootDirectory: string;

  public constructor(options: ModelPathsOptions) {
    if (!options.applicationDataDirectory.trim()) {
      throw new Error(
        "ModelPaths requires a valid application data directory.",
      );
    }

    this.rootDirectory = path.resolve(options.applicationDataDirectory);
  }

  public getRootDirectory(): string {
    return this.rootDirectory;
  }

  public getModelsDirectory(): string {
    return path.join(this.rootDirectory, "models");
  }

  public getModalityDirectory(modality: ModelModality): string {
    return path.join(this.getModelsDirectory(), modality);
  }

  public getModelDirectory(modelId: string): string {
    this.assertSafeSegment(modelId);

    return path.join(
      this.getModelsDirectory(),
      this.getModelDirectoryName(modelId),
    );
  }

  public getModelDirectoryForModality(
    modality: ModelModality,
    modelId: string,
  ): string {
    this.assertSafeSegment(modelId);

    return path.join(
      this.getModalityDirectory(modality),
      this.getModelDirectoryName(modelId),
    );
  }

  public getManifestPath(modelId: string): string {
    this.assertSafeSegment(modelId);

    return path.join(this.getModelDirectory(modelId), "manifest.json");
  }

  public getArtifactPath(modelId: string, filename: string): string {
    this.assertSafeSegment(modelId);
    this.assertSafeSegment(filename);

    return path.join(this.getModelDirectory(modelId), filename);
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

  private getModelDirectoryName(modelId: string): string {
    return modelId;
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
}