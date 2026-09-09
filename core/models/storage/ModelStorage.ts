// core/models/storage/ModelStorage.ts

import { promises as fs } from "node:fs";
import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import { createModelManifest, type ModelManifest } from "./ModelManifest";

import { ModelPaths } from "./ModelPaths";

export interface StoredModel {
  readonly modelId: string;
  readonly directory: string;
  readonly manifestPath: string;
  readonly artifactPath: string;
  readonly manifest: ModelManifest;
}

export interface ModelStorageOptions {
  readonly paths: ModelPaths;
}

export class ModelStorage {
  public constructor(private readonly options: ModelStorageOptions) {}

  public async initialize(): Promise<void> {
    const directories = [
      this.options.paths.getRootDirectory(),
      this.options.paths.getModelsDirectory(),
      this.options.paths.getModalityDirectory("llm"),
      this.options.paths.getModalityDirectory("stt"),
      this.options.paths.getModalityDirectory("vision"),
      this.options.paths.getModalityDirectory("tts"),
      this.options.paths.getModalityDirectory("embedding"),
      this.options.paths.getCacheDirectory(),
      this.options.paths.getBenchmarkDirectory(),
    ];

    for (const directory of directories) {
      await fs.mkdir(directory, {
        recursive: true,
      });
    }
  }

  public async createModelDirectory(model: ModelDefinition): Promise<string> {
    const directory = this.options.paths.getModelDirectoryForModality(
      model.modality,
      model.id,
    );

    await fs.mkdir(directory, {
      recursive: true,
    });

    return directory;
  }

  public getModelDirectory(modelId: string): string {
    return this.options.paths.getModelDirectory(modelId);
  }

  public getManifestPath(modelId: string): string {
    return this.options.paths.getManifestPath(modelId);
  }

  public async writeManifest(manifest: ModelManifest): Promise<void> {
    const manifestPath = this.options.paths.getManifestPath(manifest.modelId);

    await fs.mkdir(path.dirname(manifestPath), {
      recursive: true,
    });

    const temporaryPath = `${manifestPath}.tmp`;

    const serialized = JSON.stringify(manifest, null, 2);

    await fs.writeFile(temporaryPath, serialized, "utf8");

    await fs.rename(temporaryPath, manifestPath);
  }

  public async readManifest(modelId: string): Promise<ModelManifest | null> {
    const manifestPath = this.options.paths.getManifestPath(modelId);

    try {
      const content = await fs.readFile(manifestPath, "utf8");

      const parsed: unknown = JSON.parse(content);

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      return parsed as ModelManifest;
    } catch {
      return null;
    }
  }

  public async isInstalled(modelId: string): Promise<boolean> {
    const manifest = await this.readManifest(modelId);

    if (!manifest) {
      return false;
    }

    try {
      await fs.access(manifest.artifact.filePath);

      return true;
    } catch {
      return false;
    }
  }

  public async getStoredModel(modelId: string): Promise<StoredModel | null> {
    const manifest = await this.readManifest(modelId);

    if (!manifest) {
      return null;
    }

    try {
      await fs.access(manifest.artifact.filePath);
    } catch {
      return null;
    }

    return Object.freeze({
      modelId,
      directory: this.options.paths.getModelDirectory(modelId),
      manifestPath: this.options.paths.getManifestPath(modelId),
      artifactPath: manifest.artifact.filePath,
      manifest,
    });
  }

  public async remove(modelId: string): Promise<void> {
    const directory = this.options.paths.getModelDirectory(modelId);

    await fs.rm(directory, {
      recursive: true,
      force: true,
    });
  }
}