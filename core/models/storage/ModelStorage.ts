import { promises as fs } from "node:fs";
import path from "node:path";

import type { ModelArtifact, ModelDefinition } from "../ModelRegistry";

import type {
  ModelPackageArtifactDownload,
  ModelPackageDownloadResult,
} from "../ModelPackageDownloader";

import { createModelManifest, type ModelManifest } from "./ModelManifest";

import { ModelIntegrityService } from "./ModelIntegrityService";

import { ModelPaths } from "./ModelPaths";

/**
 * --------------------------------------------------------------------------
 * Public storage contracts
 * --------------------------------------------------------------------------
 */

export interface ModelStorageOptions {
  /**
   * Canonical path manager shared by the model system.
   */
  readonly paths: ModelPaths;
}

export interface StoredModel {
  /**
   * Registered model id.
   */
  readonly modelId: string;

  /**
   * Canonical model installation directory.
   */
  readonly directoryPath: string;

  /**
   * Primary model artifact path.
   *
   * Kept for compatibility with ModelManager
   * and runtime loading.
   */
  readonly artifactPath: string;

  /**
   * All installed artifact paths keyed by
   * artifact id.
   */
  readonly artifactPaths: Readonly<Record<string, string>>;

  /**
   * Persistent installation manifest.
   */
  readonly manifestPath: string;

  /**
   * Verified installation manifest.
   */
  readonly manifest: ModelManifest;
}

/**
 * Type of one manifest package artifact.
 *
 * Derived directly from ModelManifest so this
 * storage layer remains synchronized with the
 * manifest schema.
 */
type ManifestPackageArtifact = ModelManifest["package"]["artifacts"][number];

/**
 * Current input shape expected by createModelManifest().
 *
 * Parameters<> keeps this storage implementation
 * synchronized with the actual factory signature.
 */
type ModelManifestInput = Parameters<typeof createModelManifest>[1];

/**
 * --------------------------------------------------------------------------
 * Utilities
 * --------------------------------------------------------------------------
 */

function normalizeSha256(value: string): string {
  return value.trim().toLowerCase();
}

function freezeRecord<T extends Record<string, string>>(value: T): Readonly<T> {
  return Object.freeze({
    ...value,
  });
}

/**
 * --------------------------------------------------------------------------
 * Model storage
 * --------------------------------------------------------------------------
 */

export class ModelStorage {
  private initialized = false;

  private readonly paths: ModelPaths;

  private readonly integrity: ModelIntegrityService;

  public constructor(options: ModelStorageOptions) {
    if (!options?.paths) {
      throw new Error("ModelStorage requires a ModelPaths instance.");
    }

    this.paths = options.paths;

    this.integrity = new ModelIntegrityService(this.paths);
  }

  /**
   * --------------------------------------------------------------------------
   * Initialization
   * --------------------------------------------------------------------------
   */

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    /*
     * ModelPaths itself is immutable and does not require
     * an explicit root-directory creation API.
     *
     * Concrete directories are created lazily whenever
     * a model package needs to be installed.
     */
    this.initialized = true;
  }

  /**
   * --------------------------------------------------------------------------
   * Path access
   * --------------------------------------------------------------------------
   */

  public getPaths(): ModelPaths {
    return this.paths;
  }

  public getIntegrityService(): ModelIntegrityService {
    return this.integrity;
  }

  public getModelDirectory(model: ModelDefinition): string {
    return this.paths.getModelDirectory(model.modality, model.id);
  }

  public getManifestPath(model: ModelDefinition): string {
    return this.paths.getManifestPath(model.modality, model.id);
  }

  /**
   * --------------------------------------------------------------------------
   * Directory management
   * --------------------------------------------------------------------------
   */

  public async createModelDirectory(model: ModelDefinition): Promise<string> {
    await this.initialize();

    const directory = this.getModelDirectory(model);

    await fs.mkdir(directory, {
      recursive: true,
    });

    return directory;
  }

  /**
   * --------------------------------------------------------------------------
   * Installation lookup
   * --------------------------------------------------------------------------
   */

  public async getStoredModel(
    model: ModelDefinition,
  ): Promise<StoredModel | null> {
    await this.initialize();

    const modelDirectory = this.getModelDirectory(model);

    const manifestPath = this.getManifestPath(model);

    let manifest: ModelManifest;

    try {
      const raw = await fs.readFile(manifestPath, "utf8");

      manifest = JSON.parse(raw) as ModelManifest;
    } catch {
      return null;
    }

    /*
     * Basic manifest identity validation.
     */
    if (
      manifest.manifestVersion !== 2 ||
      manifest.modelId !== model.id ||
      manifest.modality !== model.modality ||
      manifest.runtime !== model.runtime
    ) {
      return null;
    }

    /*
     * Full integrity verification remains authoritative.
     *
     * This validates:
     *
     * - artifact existence
     * - canonical paths
     * - sizes
     * - SHA-256
     * - required package artifacts
     */
    const integrity = await this.integrity.verify(model, manifest);

    if (integrity.status !== "valid") {
      return null;
    }

    /*
     * Build artifact lookup map.
     */
    const artifactPaths: Record<string, string> = {};

    for (const artifact of manifest.package.artifacts) {
      artifactPaths[artifact.id] = artifact.filePath;
    }

    /*
     * Resolve primary artifact from manifest.
     */
    const primaryManifestArtifact = manifest.package.artifacts.find(
      (artifact) => artifact.id === manifest.package.primaryArtifactId,
    );

    if (!primaryManifestArtifact) {
      return null;
    }

    return Object.freeze({
      modelId: model.id,

      directoryPath: modelDirectory,

      artifactPath: primaryManifestArtifact.filePath,

      artifactPaths: freezeRecord(artifactPaths),

      manifestPath,

      manifest,
    });
  }

  /**
   * --------------------------------------------------------------------------
   * Package installation
   * --------------------------------------------------------------------------
   */

  public async registerInstalledPackage(
    model: ModelDefinition,
    packageDownload: ModelPackageDownloadResult,
  ): Promise<ModelManifest> {
    await this.initialize();

    const modelPackage = model.package;

    if (!modelPackage) {
      throw new Error(`Model "${model.id}" has no package definition.`);
    }

    if (packageDownload.modelId.trim() !== model.id.trim()) {
      throw new Error(
        `Package download model id does not match "${model.id}".`,
      );
    }

    const expectedArtifacts = modelPackage.artifacts;

    const downloadedArtifacts = packageDownload.artifacts;

    if (downloadedArtifacts.length !== expectedArtifacts.length) {
      throw new Error(`Package artifact count mismatch for "${model.id}".`);
    }

    /*
     * Index downloads by stable artifact id.
     */
    const downloadedById = new Map<string, ModelPackageArtifactDownload>();

    for (const item of downloadedArtifacts) {
      if (downloadedById.has(item.artifact.id)) {
        throw new Error(
          `Duplicate downloaded artifact "${item.artifact.id}" for model "${model.id}".`,
        );
      }

      downloadedById.set(item.artifact.id, item);
    }

    /*
     * Build manifest artifact records.
     */
    const manifestArtifacts: ManifestPackageArtifact[] = [];

    for (const expected of expectedArtifacts) {
      const downloaded = downloadedById.get(expected.id);

      if (!downloaded) {
        throw new Error(
          `Package artifact "${expected.id}" was not downloaded for "${model.id}".`,
        );
      }

      /*
       * Verify downloader metadata still matches
       * the registered package metadata.
       */
      if (downloaded.artifact.filename !== expected.filename) {
        throw new Error(`Artifact filename mismatch for "${expected.id}".`);
      }

      if (downloaded.artifact.sizeBytes !== expected.sizeBytes) {
        throw new Error(
          `Artifact size metadata mismatch for "${expected.id}".`,
        );
      }

      if (
        normalizeSha256(downloaded.artifact.sha256) !==
        normalizeSha256(expected.sha256)
      ) {
        throw new Error(
          `Artifact SHA-256 metadata mismatch for "${expected.id}".`,
        );
      }

      if (downloaded.result.modelId !== model.id) {
        throw new Error(
          `Artifact "${expected.id}" belongs to model "${downloaded.result.modelId}" instead of "${model.id}".`,
        );
      }

      if (downloaded.result.filePath.trim() === "") {
        throw new Error(`Artifact "${expected.id}" has no final file path.`);
      }

      const resolvedPath = path.resolve(downloaded.result.filePath);

      manifestArtifacts.push({
        id: expected.id,

        filename: expected.filename,

        role: expected.role,

        sizeBytes: expected.sizeBytes,

        sha256: normalizeSha256(expected.sha256),

        filePath: resolvedPath,
      });
    }

    /*
     * The primary artifact must be the package
     * artifact whose role is "model".
     */
    const primaryArtifactId =
      modelPackage.artifacts.find((artifact) => artifact.role === "model")
        ?.id ?? modelPackage.requiredArtifactIds[0];

    if (!primaryArtifactId) {
      throw new Error(
        `Package "${model.id}" does not define a primary model artifact.`,
      );
    }

    /*
     * IMPORTANT:
     *
     * createModelManifest() calculates totalSizeBytes
     * internally from the supplied artifacts.
     *
     * Therefore totalSizeBytes MUST NOT be supplied here.
     */
    const manifestInput: ModelManifestInput = {
      artifacts: Object.freeze(manifestArtifacts),

      requiredArtifactIds: Object.freeze([...modelPackage.requiredArtifactIds]),

      primaryArtifactId,
    };

    const manifest = createModelManifest(model, manifestInput);

    const manifestPath = this.getManifestPath(model);

    const temporaryManifestPath = `${manifestPath}.tmp`;

    await this.createModelDirectory(model);

    /*
     * Write atomically through a temporary file.
     */
    await fs.writeFile(
      temporaryManifestPath,
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    try {
      await fs.rename(temporaryManifestPath, manifestPath);
    } catch (error) {
      await fs.rm(temporaryManifestPath, {
        force: true,
      });

      throw new Error(`Failed to persist model manifest for "${model.id}".`, {
        cause: error,
      });
    }

    /*
     * Re-read and fully verify.
     *
     * This prevents an installation from being
     * reported as successful if persistence or
     * integrity validation failed.
     */
    const stored = await this.getStoredModel(model);

    if (!stored) {
      throw new Error(
        `Model "${model.id}" package was written but failed integrity verification.`,
      );
    }

    return stored.manifest;
  }

  /**
   * --------------------------------------------------------------------------
   * Legacy single-artifact compatibility
   * --------------------------------------------------------------------------
   */

  public async registerInstalledModel(
    model: ModelDefinition,
    result: {
      readonly modelId: string;
      readonly filename: string;
      readonly filePath: string;
      readonly bytesDownloaded: number;
      readonly sha256: string;
      readonly resumed: boolean;
      readonly attempts: number;
    },
  ): Promise<ModelManifest> {
    if (!model.package) {
      throw new Error(`Model "${model.id}" has no package definition.`);
    }

    if (model.package.artifacts.length !== 1) {
      throw new Error(
        `registerInstalledModel() only supports single-artifact packages. Use registerInstalledPackage().`,
      );
    }

    if (result.modelId.trim() !== model.id.trim()) {
      throw new Error(
        `Installation result model id "${result.modelId}" does not match "${model.id}".`,
      );
    }

    const artifact = model.package.artifacts[0];

    if (result.filename !== artifact.filename) {
      throw new Error(
        `Installation result filename does not match package artifact "${artifact.id}".`,
      );
    }

    const artifactDownload = Object.freeze({
      artifact,

      result: Object.freeze({
        ...result,

        artifactId: artifact.id,
      }),
    });

    const packageDownload: ModelPackageDownloadResult = Object.freeze({
      modelId: model.id,

      artifacts: Object.freeze([artifactDownload]),

      primaryArtifact: artifactDownload,

      totalBytesDownloaded: result.bytesDownloaded,

      totalBytesExpected: artifact.sizeBytes,

      resumed: result.resumed,

      attempts: result.attempts,
    });

    return this.registerInstalledPackage(model, packageDownload);
  }

  /**
   * --------------------------------------------------------------------------
   * Verified package adoption
   * --------------------------------------------------------------------------
   */

  public async adoptVerifiedPackage(
    model: ModelDefinition,
    packageDownload: ModelPackageDownloadResult,
  ): Promise<ModelManifest> {
    return this.registerInstalledPackage(model, packageDownload);
  }

  public async adoptVerifiedArtifact(
    model: ModelDefinition,
    artifact: ModelArtifact,
    result: {
      readonly modelId: string;
      readonly artifactId?: string;
      readonly filename: string;
      readonly filePath: string;
      readonly bytesDownloaded: number;
      readonly sha256: string;
      readonly resumed: boolean;
      readonly attempts: number;
    },
  ): Promise<ModelManifest> {
    if (!model.package) {
      throw new Error(`Model "${model.id}" has no package definition.`);
    }

    if (model.package.artifacts.length !== 1) {
      throw new Error(
        `adoptVerifiedArtifact() only supports single-artifact packages.`,
      );
    }

    if (result.modelId.trim() !== model.id.trim()) {
      throw new Error(
        `Verified artifact model id "${result.modelId}" does not match "${model.id}".`,
      );
    }

    if (artifact.id !== model.package.artifacts[0].id) {
      throw new Error(
        `Verified artifact "${artifact.id}" does not match the model package artifact.`,
      );
    }

    const artifactDownload = Object.freeze({
      artifact,

      result: Object.freeze({
        ...result,

        artifactId: result.artifactId ?? artifact.id,
      }),
    });

    return this.registerInstalledPackage(
      model,
      Object.freeze({
        modelId: model.id,

        artifacts: Object.freeze([artifactDownload]),

        primaryArtifact: artifactDownload,

        totalBytesDownloaded: result.bytesDownloaded,

        totalBytesExpected: artifact.sizeBytes,

        resumed: result.resumed,

        attempts: result.attempts,
      }),
    );
  }

  /**
   * --------------------------------------------------------------------------
   * Corruption / cleanup
   * --------------------------------------------------------------------------
   */

  public async markCorrupt(model: ModelDefinition): Promise<void> {
    await this.initialize();

    const directory = this.getModelDirectory(model);

    const manifestPath = this.getManifestPath(model);

    try {
      const manifest = await fs.readFile(manifestPath, "utf8");

      const corruptPath = path.join(
        directory,
        `manifest.corrupt.${Date.now()}.json`,
      );

      await fs.writeFile(corruptPath, manifest, "utf8");
    } catch {
      /*
       * No manifest may exist.
       */
    }

    await fs.rm(manifestPath, {
      force: true,
    });
  }

  public async remove(model: ModelDefinition): Promise<void> {
    await this.initialize();

    const directory = this.getModelDirectory(model);

    await fs.rm(directory, {
      recursive: true,
      force: true,
    });
  }

  /**
   * --------------------------------------------------------------------------
   * Partial cleanup
   * --------------------------------------------------------------------------
   */

  public async removePartials(model: ModelDefinition): Promise<void> {
    await this.initialize();

    const directory = this.getModelDirectory(model);

    let entries: Array<import("node:fs").Dirent<string>>;

    try {
      /*
       * Explicit UTF-8 encoding is important here.
       *
       * Without it, current Node typings can infer
       * Dirent<Buffer>, which produces the
       * NonSharedBuffer / string errors you saw.
       */
      entries = await fs.readdir(directory, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      return;
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".part"))
        .map((entry) =>
          fs.rm(path.join(directory, entry.name), {
            force: true,
          }),
        ),
    );
  }
}
