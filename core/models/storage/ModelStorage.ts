// core/models/storage/ModelStorage.ts

import { promises as fs } from "node:fs";

import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import type { ModelDownloadResult } from "../ModelDownloader";

import { createModelManifest, type ModelManifest } from "./ModelManifest";

import { ModelPaths } from "./ModelPaths";

export interface StoredModel {
  readonly modelId: string;

  readonly modality: ModelDefinition["modality"];

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

      this.options.paths.getInstallationDirectory(),
    ];

    await Promise.all(
      directories.map((directory) =>
        fs.mkdir(directory, {
          recursive: true,
        }),
      ),
    );
  }

  public async createModelDirectory(model: ModelDefinition): Promise<string> {
    const directory = this.options.paths.getModelDirectory(
      model.modality,
      model.id,
    );

    await fs.mkdir(directory, {
      recursive: true,
    });

    return directory;
  }

  public getModelDirectory(model: ModelDefinition): string {
    return this.options.paths.getModelDirectory(model.modality, model.id);
  }

  public getManifestPath(model: ModelDefinition): string {
    return this.options.paths.getManifestPath(model.modality, model.id);
  }

  public async writeManifest(manifest: ModelManifest): Promise<void> {
    const manifestPath = this.options.paths.getManifestPath(
      manifest.modality,
      manifest.modelId,
    );

    await fs.mkdir(path.dirname(manifestPath), {
      recursive: true,
    });

    const temporaryPath = `${manifestPath}.tmp`;

    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

    await fs.writeFile(temporaryPath, serialized, "utf8");

    try {
      await fs.rename(temporaryPath, manifestPath);
    } catch (error) {
      await fs.rm(temporaryPath, {
        force: true,
      });

      throw new Error(
        `Failed to atomically write model manifest "${manifest.modelId}".`,
        {
          cause: error,
        },
      );
    }
  }

  public async registerInstalledModel(
    model: ModelDefinition,
    download: ModelDownloadResult,
  ): Promise<ModelManifest> {
    if (!model.artifact) {
      throw new Error(`Model "${model.id}" does not define an artifact.`);
    }

    const manifest = createModelManifest(model, {
      filename: download.filename,

      filePath: download.filePath,

      sizeBytes: download.bytesDownloaded,

      sha256: download.sha256,
    });

    await this.writeManifest(manifest);

    return manifest;
  }

  public async readManifest(
    model: ModelDefinition,
  ): Promise<ModelManifest | null> {
    const manifestPath = this.options.paths.getManifestPath(
      model.modality,
      model.id,
    );

    try {
      const content = await fs.readFile(manifestPath, "utf8");

      const parsed: unknown = JSON.parse(content);

      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      const manifest = parsed as Partial<ModelManifest>;

      if (
        manifest.modelId !== model.id ||
        manifest.modality !== model.modality
      ) {
        return null;
      }

      return parsed as ModelManifest;
    } catch {
      return null;
    }
  }

  public async isInstalled(model: ModelDefinition): Promise<boolean> {
    const stored = await this.getStoredModel(model);

    return stored !== null && stored.manifest.status === "installed";
  }

  public async getStoredModel(
    model: ModelDefinition,
  ): Promise<StoredModel | null> {
    const manifest = await this.readManifest(model);

    if (!manifest) {
      return null;
    }

    if (manifest.status !== "installed") {
      return null;
    }

    try {
      await fs.access(manifest.artifact.filePath);
    } catch {
      return null;
    }

    return Object.freeze({
      modelId: model.id,

      modality: model.modality,

      directory: this.options.paths.getModelDirectory(model.modality, model.id),

      manifestPath: this.options.paths.getManifestPath(
        model.modality,
        model.id,
      ),

      artifactPath: manifest.artifact.filePath,

      manifest,
    });
  }

  public async remove(model: ModelDefinition): Promise<void> {
    const directory = this.options.paths.getModelDirectory(
      model.modality,
      model.id,
    );

    await fs.rm(directory, {
      recursive: true,
      force: true,
    });
  }

  public async markCorrupt(model: ModelDefinition): Promise<void> {
    const manifest = await this.readManifest(model);

    if (!manifest) {
      return;
    }

    const updated: ModelManifest = Object.freeze({
      ...manifest,
      status: "corrupt",
      updatedAt: Date.now(),
    });

    await this.writeManifest(updated);
  }
}
