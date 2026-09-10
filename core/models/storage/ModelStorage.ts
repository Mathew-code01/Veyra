// core/models/storage/ModelStorage.ts

import { createHash } from "node:crypto";

import { createReadStream, promises as fs } from "node:fs";

import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import type { ModelDownloadResult } from "../ModelDownloader";

import { createModelManifest, type ModelManifest } from "./ModelManifest";

import { ModelPaths } from "./ModelPaths";

import {
  ModelIntegrityService,
  type ModelIntegrityResult,
} from "./ModelIntegrityService";

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

  readonly integrity?: ModelIntegrityService;
}

export class ModelStorage {
  private readonly integrity: ModelIntegrityService;

  public constructor(private readonly options: ModelStorageOptions) {
    this.integrity =
      options.integrity ?? new ModelIntegrityService(options.paths);
  }

  public async initialize(): Promise<void> {
    const directories = [
      this.options.paths.getRootDirectory(),

      this.options.paths.getModelsDirectory(),

      this.options.paths.getModalityDirectory("llm"),

      this.options.paths.getModalityDirectory("stt"),

      this.options.paths.getModalityDirectory("vision"),

      this.options.paths.getModalityDirectory("tts"),

      this.options.paths.getModalityDirectory("embedding"),

      this.options.paths.getRuntimeDirectory("llama_cpp"),

      this.options.paths.getRuntimeDirectory("whisper_cpp"),

      this.options.paths.getRuntimeDirectory("onnx"),

      this.options.paths.getCacheDirectory(),

      this.options.paths.getBenchmarkDirectory(),

      this.options.paths.getInstallationDirectory(),

      this.options.paths.getRecoveryDirectory(),
    ];

    await Promise.all(
      directories.map((directory) =>
        fs.mkdir(directory, {
          recursive: true,
        }),
      ),
    );
  }

  public getModelDirectory(model: ModelDefinition): string {
    return this.options.paths.getModelDirectory(model.modality, model.id);
  }

  public getArtifactPath(model: ModelDefinition, filename: string): string {
    return this.options.paths.getArtifactPath(
      model.modality,
      model.id,
      filename,
    );
  }

  public getManifestPath(model: ModelDefinition): string {
    return this.options.paths.getManifestPath(model.modality, model.id);
  }

  public getPartialArtifactPath(
    model: ModelDefinition,
    filename: string,
  ): string {
    return this.options.paths.getPartialArtifactPath(
      model.modality,
      model.id,
      filename,
    );
  }

  public async createModelDirectory(model: ModelDefinition): Promise<string> {
    const directory = this.getModelDirectory(model);

    await fs.mkdir(directory, {
      recursive: true,
    });

    return directory;
  }

  public async registerInstalledModel(
    model: ModelDefinition,
    download: ModelDownloadResult,
  ): Promise<ModelManifest> {
    if (!model.artifact) {
      throw new Error(`Model "${model.id}" has no configured artifact.`);
    }

    const canonicalPath = this.getArtifactPath(model, download.filename);

    if (path.resolve(canonicalPath) !== path.resolve(download.filePath)) {
      throw new Error(
        `Downloaded artifact path does not match Veyra's canonical model path.`,
      );
    }

    const manifest = createModelManifest(model, {
      filename: download.filename,

      filePath: canonicalPath,

      sizeBytes: download.bytesDownloaded,

      sha256: download.sha256,
    });

    await this.writeManifest(manifest);

    return manifest;
  }

  public async adoptVerifiedArtifact(
    model: ModelDefinition,
  ): Promise<ModelManifest | null> {
    if (!model.artifact) {
      return null;
    }

    const artifactPath = this.getArtifactPath(model, model.artifact.filename);

    try {
      const stat = await fs.stat(artifactPath);

      if (!stat.isFile()) {
        return null;
      }

      const expectedSize = model.artifact.sizeBytes;

      if (expectedSize !== undefined && stat.size !== expectedSize) {
        return null;
      }

      const actualSha256 = await this.calculateSha256(artifactPath);

      const expectedSha256 = model.artifact.sha256?.trim().toLowerCase();

      if (!expectedSha256 || actualSha256 !== expectedSha256) {
        return null;
      }

      const manifest = createModelManifest(model, {
        filename: model.artifact.filename,

        filePath: artifactPath,

        sizeBytes: stat.size,

        sha256: actualSha256,
      });

      await this.writeManifest(manifest);

      return manifest;
    } catch {
      return null;
    }
  }

  public async writeManifest(manifest: ModelManifest): Promise<void> {
    const manifestPath = this.options.paths.getManifestPath(
      manifest.modality,
      manifest.modelId,
    );

    const temporaryPath = this.options.paths.getManifestTempPath(
      manifest.modality,
      manifest.modelId,
    );

    await fs.mkdir(path.dirname(manifestPath), {
      recursive: true,
    });

    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    try {
      await fs.rename(temporaryPath, manifestPath);
    } catch (error) {
      await fs.rm(temporaryPath, {
        force: true,
      });

      throw new Error(
        `Could not atomically commit manifest for "${manifest.modelId}".`,
        {
          cause: error,
        },
      );
    }
  }

  public async readManifest(
    model: ModelDefinition,
  ): Promise<ModelManifest | null> {
    const manifestPath = this.getManifestPath(model);

    try {
      const content = await fs.readFile(manifestPath, "utf8");

      const parsed: unknown = JSON.parse(content);

      if (!this.isManifestShape(parsed)) {
        return null;
      }

      if (parsed.modelId !== model.id || parsed.modality !== model.modality) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  public async verifyModel(
    model: ModelDefinition,
  ): Promise<ModelIntegrityResult> {
    const manifest = await this.readManifest(model);

    if (!manifest) {
      return {
        modelId: model.id,

        status: "missing",

        exists: false,

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: null,

        actualSha256: null,

        expectedSha256: model.artifact?.sha256 ?? null,

        reason: "No valid installation manifest exists.",
      };
    }

    return this.integrity.verify(model, manifest);
  }

  public async isInstalled(model: ModelDefinition): Promise<boolean> {
    const result = await this.verifyModel(model);

    return result.status === "valid";
  }

  public async getStoredModel(
    model: ModelDefinition,
  ): Promise<StoredModel | null> {
    const manifest = await this.readManifest(model);

    if (!manifest) {
      return null;
    }

    const integrity = await this.integrity.verify(model, manifest);

    if (integrity.status !== "valid") {
      return null;
    }

    return Object.freeze({
      modelId: model.id,

      modality: model.modality,

      directory: this.getModelDirectory(model),

      manifestPath: this.getManifestPath(model),

      artifactPath: manifest.artifact.filePath,

      manifest,
    });
  }

  public async markCorrupt(model: ModelDefinition): Promise<void> {
    const manifest = await this.readManifest(model);

    if (!manifest) {
      return;
    }

    await this.writeManifest(
      Object.freeze({
        ...manifest,

        status: "corrupt",

        updatedAt: Date.now(),
      }),
    );
  }

  public async remove(model: ModelDefinition): Promise<void> {
    await fs.rm(this.getModelDirectory(model), {
      recursive: true,
      force: true,
    });
  }

  public async cleanupTransactionFiles(model: ModelDefinition): Promise<void> {
    const temporaryManifest = this.options.paths.getManifestTempPath(
      model.modality,
      model.id,
    );

    await fs.rm(temporaryManifest, {
      force: true,
    });
  }

  private isManifestShape(value: unknown): value is ModelManifest {
    if (!value || typeof value !== "object") {
      return false;
    }

    const record = value as Record<string, unknown>;

    return (
      record.manifestVersion === 1 &&
      typeof record.modelId === "string" &&
      typeof record.modality === "string" &&
      typeof record.runtime === "string" &&
      typeof record.status === "string" &&
      typeof record.artifact === "object"
    );
  }

  private async calculateSha256(filePath: string): Promise<string> {
    const hash = createHash("sha256");

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);

      stream.on("data", (chunk) => {
        hash.update(chunk);
      });

      stream.once("end", resolve);

      stream.once("error", reject);
    });

    return hash.digest("hex");
  }
}
