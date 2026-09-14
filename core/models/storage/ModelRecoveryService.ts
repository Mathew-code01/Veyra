
// core/models/storage/ModelRecoveryService.ts

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ModelArtifact,
  ModelDefinition,
} from "../ModelRegistry";

import type {
  ModelPackageArtifactDownload,
  ModelPackageDownloadResult,
} from "../ModelPackageDownloader";

import { ModelPaths } from "./ModelPaths";

import {
  isModelManifest,
  type ModelManifest,
} from "./ModelManifest";

import { ModelStorage } from "./ModelStorage";

export type ModelRecoveryStatus =
  | "healthy"
  | "recovered"
  | "missing"
  | "corrupt"
  | "partial"
  | "untracked";

export interface ModelRecoveryResult {
  readonly modelId: string;

  readonly status: ModelRecoveryStatus;

  readonly message: string;
}

interface VerifiedArtifactFile {
  readonly artifact: ModelArtifact;

  readonly filePath: string;

  readonly sizeBytes: number;

  readonly sha256: string;
}

interface PackageInspection {
  readonly allArtifactsPresent: boolean;

  readonly allRequiredArtifactsPresent: boolean;

  readonly hasPartialArtifacts: boolean;

  readonly hasAnyArtifacts: boolean;
}

export class ModelRecoveryService {
  public constructor(
    private readonly options: {
      readonly storage: ModelStorage;

      readonly paths: ModelPaths;
    },
  ) {}

  /**
   * ------------------------------------------------------------------------
   * Recover one model
   * ------------------------------------------------------------------------
   *
   * Recovery is intentionally conservative.
   *
   * A file is never adopted merely because it exists.
   *
   * Recovery requires:
   *
   * 1. The expected package definition.
   * 2. The expected filename.
   * 3. The expected byte size.
   * 4. The expected SHA-256.
   * 5. A complete package.
   *
   * Once those conditions are met, ModelStorage remains the
   * authoritative layer responsible for creating the manifest
   * and performing the final integrity verification.
   */
  public async recover(
    model: ModelDefinition,
  ): Promise<ModelRecoveryResult> {
    /**
     * Remove only known transaction leftovers.
     *
     * This recovery service is expected to run during the startup /
     * recovery phase when no active installation owns the model lock.
     */
    await this.cleanupTransactionFiles(model);

    const manifest = await this.readManifest(model);

    /**
     * ----------------------------------------------------------------------
     * CASE 1
     * ----------------------------------------------------------------------
     *
     * A valid manifest exists.
     *
     * Verify it through ModelIntegrityService.
     */
    if (manifest) {
      const integrity = await this.options.storage
        .getIntegrityService()
        .verify(model, manifest);

      if (integrity.status === "valid") {
        return Object.freeze({
          modelId: model.id,

          status: "healthy",

          message:
            "Installed model package verified successfully.",
        });
      }

      /**
       * The manifest exists but its package no longer matches.
       *
       * Preserve partial files if available so the installation
       * can still be resumed/repaired.
       */
      if (await this.hasPartialArtifacts(model)) {
        return Object.freeze({
          modelId: model.id,

          status: "partial",

          message:
            "The installed model is incomplete, but partial package files are available for recovery or resume.",
        });
      }

      await this.options.storage.markCorrupt(model);

      return Object.freeze({
        modelId: model.id,

        status: "corrupt",

        message:
          integrity.reason ??
          "Installed model failed integrity verification.",
      });
    }

    /**
     * ----------------------------------------------------------------------
     * CASE 2
     * ----------------------------------------------------------------------
     *
     * No valid manifest exists.
     *
     * Inspect the package files directly.
     */
    const packageState = await this.inspectPackageFiles(model);

    /**
     * If every package artifact exists, cryptographically verify
     * the complete package before adopting it.
     */
    if (packageState.allArtifactsPresent) {
      const verifiedArtifacts =
        await this.verifyPackageArtifacts(model);

      const expectedArtifactCount =
        model.package?.artifacts.length ?? 0;

      if (
        expectedArtifactCount > 0 &&
        verifiedArtifacts.length === expectedArtifactCount
      ) {
        const recovered = await this.adoptVerifiedPackage(
          model,
          verifiedArtifacts,
        );

        if (recovered) {
          return Object.freeze({
            modelId: model.id,

            status: "recovered",

            message:
              "A fully downloaded package was cryptographically verified and recovered without its manifest.",
          });
        }
      }

      return Object.freeze({
        modelId: model.id,

        status: "untracked",

        message:
          "All expected model files exist, but the package could not be safely adopted.",
      });
    }

    /**
     * If some package files or partial downloads exist, preserve
     * them as recoverable state.
     */
    if (packageState.hasPartialArtifacts) {
      return Object.freeze({
        modelId: model.id,

        status: "partial",

        message:
          "Partial model package files are available for resume.",
      });
    }

    /**
     * Files belonging to the model exist, but the package is
     * incomplete or cannot be matched safely.
     */
    if (packageState.hasAnyArtifacts) {
      return Object.freeze({
        modelId: model.id,

        status: "untracked",

        message:
          "Model files exist without a valid manifest, but the complete package could not be safely recovered.",
      });
    }

    return Object.freeze({
      modelId: model.id,

      status: "missing",

      message:
        "No verified model installation exists.",
    });
  }

  /**
   * ------------------------------------------------------------------------
   * Recover all models
   * ------------------------------------------------------------------------
   */
  public async recoverAll(
    models: readonly ModelDefinition[],
  ): Promise<readonly ModelRecoveryResult[]> {
    const results: ModelRecoveryResult[] = [];

    for (const model of models) {
      results.push(await this.recover(model));
    }

    return Object.freeze(results);
  }

  /**
   * ------------------------------------------------------------------------
   * Manifest
   * ------------------------------------------------------------------------
   */
  private async readManifest(
    model: ModelDefinition,
  ): Promise<ModelManifest | null> {
    /**
     * IMPORTANT:
     *
     * ModelRecoveryService does not have a direct "paths" property.
     *
     * The ModelPaths instance is stored under:
     *
     * this.options.paths
     */
    const manifestPath =
      this.options.paths.getManifestPath(
        model.modality,
        model.id,
      );

    try {
      const raw = await fs.readFile(
        manifestPath,
        "utf8",
      );

      const parsed: unknown = JSON.parse(raw);

      if (!isModelManifest(parsed)) {
        return null;
      }

      /**
       * Never trust a manifest belonging to another model.
       */
      if (
        parsed.modelId !== model.id ||
        parsed.modality !== model.modality ||
        parsed.runtime !== model.runtime
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * ------------------------------------------------------------------------
   * Transaction cleanup
   * ------------------------------------------------------------------------
   */
  private async cleanupTransactionFiles(
    model: ModelDefinition,
  ): Promise<void> {
    const manifestTempPath =
      this.options.paths.getManifestTempPath(
        model.modality,
        model.id,
      );

    const lockPath =
      this.options.paths.getOperationLockPath(
        model.modality,
        model.id,
      );

    /**
     * Remove the known temporary manifest.
     */
    await fs.rm(manifestTempPath, {
      force: true,
    });

    /**
     * Remove only the known model-operation lock.
     *
     * Recovery must be invoked when the installation manager
     * is not actively owning this operation.
     */
    await fs.rm(lockPath, {
      force: true,
    });
  }

  /**
   * ------------------------------------------------------------------------
   * Package inspection
   * ------------------------------------------------------------------------
   */
  private async inspectPackageFiles(
    model: ModelDefinition,
  ): Promise<PackageInspection> {
    if (!model.package) {
      return {
        allArtifactsPresent: false,

        allRequiredArtifactsPresent: false,

        hasPartialArtifacts: false,

        hasAnyArtifacts: false,
      };
    }

    let hasAnyArtifacts = false;

    let hasPartialArtifacts = false;

    let allArtifactsPresent = true;

    let allRequiredArtifactsPresent = true;

    for (const artifact of model.package.artifacts) {
      const artifactPath =
        this.options.paths.getArtifactPath(
          model.modality,
          model.id,
          artifact.filename,
        );

      const partialPath =
        this.options.paths.getPartialArtifactPath(
          model.modality,
          model.id,
          artifact.filename,
        );

      const artifactExists =
        await this.exists(artifactPath);

      const partialExists =
        await this.exists(partialPath);

      if (artifactExists) {
        hasAnyArtifacts = true;
      }

      if (partialExists) {
        hasPartialArtifacts = true;
      }

      /**
       * A package can only be adopted when EVERY package
       * artifact exists.
       */
      if (!artifactExists) {
        allArtifactsPresent = false;
      }

      /**
       * Required artifacts determine whether a partial
       * installation is meaningful.
       */
      if (
        model.package.requiredArtifactIds.includes(
          artifact.id,
        ) &&
        !artifactExists
      ) {
        allRequiredArtifactsPresent = false;
      }
    }

    return {
      allArtifactsPresent,

      allRequiredArtifactsPresent,

      hasPartialArtifacts,

      hasAnyArtifacts,
    };
  }

  /**
   * ------------------------------------------------------------------------
   * Partial artifacts
   * ------------------------------------------------------------------------
   */
  private async hasPartialArtifacts(
    model: ModelDefinition,
  ): Promise<boolean> {
    if (!model.package) {
      return false;
    }

    for (const artifact of model.package.artifacts) {
      const partialPath =
        this.options.paths.getPartialArtifactPath(
          model.modality,
          model.id,
          artifact.filename,
        );

      if (await this.exists(partialPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * ------------------------------------------------------------------------
   * Cryptographic package verification
   * ------------------------------------------------------------------------
   *
   * Every package artifact is verified here.
   *
   * This is important for multi-artifact packages such as:
   *
   * Kokoro:
   *
   * - model_fp16.onnx
   * - af.bin
   *
   * We do not adopt only the primary model file.
   */
  private async verifyPackageArtifacts(
    model: ModelDefinition,
  ): Promise<readonly VerifiedArtifactFile[]> {
    if (!model.package) {
      return Object.freeze([]);
    }

    const verified: VerifiedArtifactFile[] = [];

    for (const artifact of model.package.artifacts) {
      const filePath =
        this.options.paths.getArtifactPath(
          model.modality,
          model.id,
          artifact.filename,
        );

      try {
        const stat = await fs.stat(filePath);

        if (!stat.isFile()) {
          return Object.freeze([]);
        }

        /**
         * Verify exact byte size first.
         */
        if (stat.size !== artifact.sizeBytes) {
          return Object.freeze([]);
        }

        /**
         * Verify exact SHA-256.
         */
        const sha256 =
          await this.hashFile(filePath);

        if (
          sha256 !==
          artifact.sha256.trim().toLowerCase()
        ) {
          return Object.freeze([]);
        }

        verified.push({
          artifact,

          filePath: path.resolve(filePath),

          sizeBytes: stat.size,

          sha256,
        });
      } catch {
        return Object.freeze([]);
      }
    }

    return Object.freeze(verified);
  }

  /**
   * ------------------------------------------------------------------------
   * Adopt a verified package
   * ------------------------------------------------------------------------
   */
  private async adoptVerifiedPackage(
    model: ModelDefinition,
    verifiedArtifacts: readonly VerifiedArtifactFile[],
  ): Promise<boolean> {
    if (!model.package) {
      return false;
    }

    /**
     * registerInstalledPackage() requires the complete package,
     * not merely requiredArtifactIds.
     */
    if (
      verifiedArtifacts.length !==
      model.package.artifacts.length
    ) {
      return false;
    }

    const downloads: ModelPackageArtifactDownload[] =
      [];

    for (const verified of verifiedArtifacts) {
      downloads.push({
        artifact: verified.artifact,

        result: {
          modelId: model.id,

          artifactId: verified.artifact.id,

          filename: verified.artifact.filename,

          filePath: verified.filePath,

          bytesDownloaded:
            verified.sizeBytes,

          sha256: verified.sha256,

          resumed: false,

          attempts: 0,
        },
      });
    }

    /**
     * The package must have a model-role artifact.
     *
     * This mirrors the ModelManifest contract.
     */
    const primaryArtifact =
      downloads.find(
        (item) =>
          item.artifact.role === "model",
      ) ?? null;

    if (!primaryArtifact) {
      return false;
    }

    const totalBytesDownloaded =
      downloads.reduce(
        (total, item) =>
          total +
          item.result.bytesDownloaded,
        0,
      );

    const totalBytesExpected =
      downloads.reduce(
        (total, item) =>
          total +
          item.artifact.sizeBytes,
        0,
      );

    const packageDownload: ModelPackageDownloadResult =
      Object.freeze({
        modelId: model.id,

        artifacts:
          Object.freeze(downloads),

        primaryArtifact,

        totalBytesDownloaded,

        totalBytesExpected,

        resumed: false,

        attempts: 0,
      });

    try {
      /**
       * ModelStorage creates the manifest and performs
       * its own final integrity verification.
       */
      await this.options.storage
        .registerInstalledPackage(
          model,
          packageDownload,
        );

      /**
       * Read it back through the authoritative storage
       * path. This provides one final recovery check.
       */
      const stored =
        await this.options.storage
          .getStoredModel(model);

      return stored !== null;
    } catch {
      return false;
    }
  }

  /**
   * ------------------------------------------------------------------------
   * SHA-256
   * ------------------------------------------------------------------------
   */
  private async hashFile(
    filePath: string,
  ): Promise<string> {
    const hash = createHash("sha256");

    const fileHandle =
      await fs.open(filePath, "r");

    try {
      const buffer =
        Buffer.allocUnsafe(
          1024 * 1024,
        );

      while (true) {
        const result =
          await fileHandle.read(
            buffer,
            0,
            buffer.length,
            null,
          );

        if (result.bytesRead === 0) {
          break;
        }

        hash.update(
          buffer.subarray(
            0,
            result.bytesRead,
          ),
        );
      }
    } finally {
      await fileHandle.close();
    }

    return hash
      .digest("hex")
      .toLowerCase();
  }

  /**
   * ------------------------------------------------------------------------
   * Filesystem helper
   * ------------------------------------------------------------------------
   */
  private async exists(
    filePath: string,
  ): Promise<boolean> {
    try {
      await fs.access(filePath);

      return true;
    } catch {
      return false;
    }
  }
}
