// core/models/storage/ModelIntegrityService.ts

import { createHash } from "node:crypto";

import { createReadStream, promises as fs } from "node:fs";

import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import type { ModelManifest } from "./ModelManifest";

import { ModelPaths } from "./ModelPaths";

export type ModelIntegrityStatus = "valid" | "missing" | "corrupt" | "unsafe";

export interface ModelIntegrityResult {
  readonly modelId: string;

  readonly status: ModelIntegrityStatus;

  readonly exists: boolean;

  readonly checksumVerified: boolean;

  readonly actualSizeBytes: number | null;

  readonly expectedSizeBytes: number | null;

  readonly actualSha256: string | null;

  readonly expectedSha256: string | null;

  readonly reason: string | null;
}

export class ModelIntegrityService {
  public constructor(private readonly paths: ModelPaths) {}

  public async verify(
    model: ModelDefinition,
    manifest: ModelManifest,
  ): Promise<ModelIntegrityResult> {
    if (manifest.modelId !== model.id || manifest.modality !== model.modality) {
      return this.failure(
        model.id,
        "unsafe",
        "Manifest identity does not match the registered model.",
      );
    }

    const expectedDirectory = this.paths.getModelDirectory(
      model.modality,
      model.id,
    );

    const expectedArtifactPath = this.paths.getArtifactPath(
      model.modality,
      model.id,
      manifest.artifact.filename,
    );

    const manifestArtifactPath = path.resolve(manifest.artifact.filePath);

    const canonicalArtifactPath = path.resolve(expectedArtifactPath);

    const canonicalDirectory = path.resolve(expectedDirectory);

    if (manifestArtifactPath !== canonicalArtifactPath) {
      return this.failure(
        model.id,
        "unsafe",
        "Manifest artifact path does not match the canonical Veyra model path.",
      );
    }

    if (!manifestArtifactPath.startsWith(`${canonicalDirectory}${path.sep}`)) {
      return this.failure(
        model.id,
        "unsafe",
        "Manifest artifact path escapes the model directory.",
      );
    }

    try {
      const stat = await fs.stat(canonicalArtifactPath);

      if (!stat.isFile()) {
        return this.failure(
          model.id,
          "corrupt",
          "The model artifact path does not reference a regular file.",
        );
      }

      const expectedSize = manifest.artifact.sizeBytes;

      if (stat.size !== expectedSize) {
        return {
          modelId: model.id,

          status: "corrupt",

          exists: true,

          checksumVerified: false,

          actualSizeBytes: stat.size,

          expectedSizeBytes: expectedSize,

          actualSha256: null,

          expectedSha256: manifest.artifact.sha256,

          reason: `Model size mismatch. Expected ${expectedSize} bytes but found ${stat.size}.`,
        };
      }

      const actualSha256 = await this.calculateSha256(canonicalArtifactPath);

      const expectedSha256 = manifest.artifact.sha256.trim().toLowerCase();

      if (actualSha256 !== expectedSha256) {
        return {
          modelId: model.id,

          status: "corrupt",

          exists: true,

          checksumVerified: false,

          actualSizeBytes: stat.size,

          expectedSizeBytes: expectedSize,

          actualSha256,

          expectedSha256,

          reason: "SHA-256 checksum mismatch.",
        };
      }

      return Object.freeze({
        modelId: model.id,

        status: "valid",

        exists: true,

        checksumVerified: true,

        actualSizeBytes: stat.size,

        expectedSizeBytes: expectedSize,

        actualSha256,

        expectedSha256,

        reason: null,
      });
    } catch (error) {
      return this.failure(
        model.id,
        "missing",
        error instanceof Error
          ? error.message
          : "Model artifact could not be accessed.",
      );
    }
  }

  private failure(
    modelId: string,
    status: ModelIntegrityStatus,
    reason: string,
  ): ModelIntegrityResult {
    return Object.freeze({
      modelId,
      status,
      exists: status !== "missing",
      checksumVerified: false,
      actualSizeBytes: null,
      expectedSizeBytes: null,
      actualSha256: null,
      expectedSha256: null,
      reason,
    });
  }

  private async calculateSha256(filePath: string): Promise<string> {
    const hash = createHash("sha256");

    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);

      stream.on("data", (chunk) => {
        hash.update(chunk);
      });

      stream.once("end", () => resolve());

      stream.once("error", reject);
    });

    return hash.digest("hex");
  }
}
