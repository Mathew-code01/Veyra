// core/models/storage/ModelIntegrityService.ts

import { createHash } from "node:crypto";

import { createReadStream, promises as fs } from "node:fs";

import path from "node:path";

import type { ModelDefinition } from "../ModelRegistry";

import type { ModelManifest, ModelManifestArtifact } from "./ModelManifest";

import { ModelPaths } from "./ModelPaths";

export type ModelIntegrityStatus = "valid" | "missing" | "corrupt" | "unsafe";

export interface ModelIntegrityArtifactResult {
  readonly artifactId: string;

  readonly filename: string;

  readonly status: "valid" | "missing" | "corrupt" | "unsafe";

  readonly exists: boolean;

  readonly checksumVerified: boolean;

  readonly actualSizeBytes: number | null;

  readonly expectedSizeBytes: number | null;

  readonly actualSha256: string | null;

  readonly expectedSha256: string | null;

  readonly reason: string | null;
}

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

  readonly artifacts: readonly ModelIntegrityArtifactResult[];

  readonly validArtifactCount: number;

  readonly requiredArtifactCount: number;
}

export class ModelIntegrityService {
  public constructor(private readonly paths: ModelPaths) {}

  public async verify(
    model: ModelDefinition,
    manifest: ModelManifest,
  ): Promise<ModelIntegrityResult> {
    if (manifest.manifestVersion !== 2) {
      return this.failure(
        model.id,
        "unsafe",
        "Unsupported model manifest version.",
      );
    }

    if (
      manifest.modelId !== model.id ||
      manifest.modality !== model.modality ||
      manifest.runtime !== model.runtime
    ) {
      return this.failure(
        model.id,
        "unsafe",
        "Manifest identity does not match the registered model.",
      );
    }

    if (!model.package) {
      return this.failure(
        model.id,
        "unsafe",
        "Registered model has no package definition.",
      );
    }

    const packageArtifacts = model.package.artifacts;

    const manifestArtifacts = manifest.package.artifacts;

    const requiredIds = new Set(model.package.requiredArtifactIds);

    const manifestRequiredIds = new Set(manifest.package.requiredArtifactIds);

    if (requiredIds.size !== manifestRequiredIds.size) {
      return this.failure(
        model.id,
        "unsafe",
        "Manifest required artifact set does not match the registered model package.",
      );
    }

    for (const requiredId of requiredIds) {
      if (!manifestRequiredIds.has(requiredId)) {
        return this.failure(
          model.id,
          "unsafe",
          `Manifest is missing required artifact "${requiredId}".`,
        );
      }
    }

    const results: ModelIntegrityArtifactResult[] = [];

    for (const artifact of packageArtifacts) {
      const manifestArtifact = manifestArtifacts.find(
        (entry) => entry.id === artifact.id,
      );

      if (!manifestArtifact) {
        results.push(
          Object.freeze({
            artifactId: artifact.id,

            filename: artifact.filename,

            status: "unsafe",

            exists: false,

            checksumVerified: false,

            actualSizeBytes: null,

            expectedSizeBytes: artifact.sizeBytes,

            actualSha256: null,

            expectedSha256: artifact.sha256,

            reason:
              "Required artifact is missing from the installation manifest.",
          }),
        );

        continue;
      }

      const result = await this.verifyArtifact(
        model,
        artifact,
        manifestArtifact,
      );

      results.push(result);
    }

    const requiredResults = results.filter((result) =>
      requiredIds.has(result.artifactId),
    );

    const validRequiredResults = requiredResults.filter(
      (result) => result.status === "valid",
    );

    const unsafe = results.some((result) => result.status === "unsafe");

    const corrupt = results.some((result) => result.status === "corrupt");

    const missing = results.some((result) => result.status === "missing");

    if (unsafe) {
      return Object.freeze({
        modelId: model.id,

        status: "unsafe",

        exists: results.some((result) => result.exists),

        checksumVerified:
          validRequiredResults.length === requiredResults.length,

        actualSizeBytes: null,

        expectedSizeBytes: manifest.package.totalSizeBytes,

        actualSha256: null,

        expectedSha256: null,

        reason:
          "One or more package artifacts failed path or manifest safety validation.",

        artifacts: Object.freeze(results),

        validArtifactCount: validRequiredResults.length,

        requiredArtifactCount: requiredResults.length,
      });
    }

    if (corrupt) {
      return Object.freeze({
        modelId: model.id,

        status: "corrupt",

        exists: true,

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: manifest.package.totalSizeBytes,

        actualSha256: null,

        expectedSha256: null,

        reason: "One or more package artifacts are corrupted.",

        artifacts: Object.freeze(results),

        validArtifactCount: validRequiredResults.length,

        requiredArtifactCount: requiredResults.length,
      });
    }

    if (missing || validRequiredResults.length !== requiredResults.length) {
      return Object.freeze({
        modelId: model.id,

        status: "missing",

        exists: results.some((result) => result.exists),

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: manifest.package.totalSizeBytes,

        actualSha256: null,

        expectedSha256: null,

        reason: "One or more required package artifacts are missing.",

        artifacts: Object.freeze(results),

        validArtifactCount: validRequiredResults.length,

        requiredArtifactCount: requiredResults.length,
      });
    }

    const actualTotalBytes = requiredResults.reduce(
      (total, result) => total + (result.actualSizeBytes ?? 0),
      0,
    );

    return Object.freeze({
      modelId: model.id,

      status: "valid",

      exists: true,

      checksumVerified: true,

      actualSizeBytes: actualTotalBytes,

      expectedSizeBytes: manifest.package.totalSizeBytes,

      actualSha256: null,

      expectedSha256: null,

      reason: null,

      artifacts: Object.freeze(results),

      validArtifactCount: validRequiredResults.length,

      requiredArtifactCount: requiredResults.length,
    });
  }

  private async verifyArtifact(
    model: ModelDefinition,
    artifact: {
      readonly id: string;

      readonly filename: string;

      readonly sizeBytes: number;

      readonly sha256: string;
    },
    manifestArtifact: ModelManifestArtifact,
  ): Promise<ModelIntegrityArtifactResult> {
    if (
      artifact.id !== manifestArtifact.id ||
      artifact.filename !== manifestArtifact.filename ||
      artifact.sizeBytes !== manifestArtifact.sizeBytes ||
      artifact.sha256.trim().toLowerCase() !==
        manifestArtifact.sha256.trim().toLowerCase()
    ) {
      return Object.freeze({
        artifactId: artifact.id,

        filename: artifact.filename,

        status: "unsafe",

        exists: false,

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: artifact.sizeBytes,

        actualSha256: null,

        expectedSha256: artifact.sha256,

        reason:
          "Manifest artifact metadata does not match the registered package artifact.",
      });
    }

    const expectedDirectory = this.paths.getModelDirectory(
      model.modality,
      model.id,
    );

    const expectedArtifactPath = this.paths.getArtifactPath(
      model.modality,
      model.id,
      artifact.filename,
    );

    const canonicalDirectory = path.resolve(expectedDirectory);

    const canonicalArtifactPath = path.resolve(expectedArtifactPath);

    const manifestArtifactPath = path.resolve(manifestArtifact.filePath);

    if (manifestArtifactPath !== canonicalArtifactPath) {
      return Object.freeze({
        artifactId: artifact.id,

        filename: artifact.filename,

        status: "unsafe",

        exists: false,

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: artifact.sizeBytes,

        actualSha256: null,

        expectedSha256: artifact.sha256,

        reason:
          "Manifest artifact path does not match the canonical Veyra model path.",
      });
    }

    if (!manifestArtifactPath.startsWith(`${canonicalDirectory}${path.sep}`)) {
      return Object.freeze({
        artifactId: artifact.id,

        filename: artifact.filename,

        status: "unsafe",

        exists: false,

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: artifact.sizeBytes,

        actualSha256: null,

        expectedSha256: artifact.sha256,

        reason: "Manifest artifact path escapes the model directory.",
      });
    }

    try {
      const stat = await fs.stat(canonicalArtifactPath);

      if (!stat.isFile()) {
        return Object.freeze({
          artifactId: artifact.id,

          filename: artifact.filename,

          status: "corrupt",

          exists: true,

          checksumVerified: false,

          actualSizeBytes: stat.size,

          expectedSizeBytes: artifact.sizeBytes,

          actualSha256: null,

          expectedSha256: artifact.sha256,

          reason: "Artifact path does not reference a regular file.",
        });
      }

      if (stat.size !== artifact.sizeBytes) {
        return Object.freeze({
          artifactId: artifact.id,

          filename: artifact.filename,

          status: "corrupt",

          exists: true,

          checksumVerified: false,

          actualSizeBytes: stat.size,

          expectedSizeBytes: artifact.sizeBytes,

          actualSha256: null,

          expectedSha256: artifact.sha256,

          reason: `Artifact size mismatch. Expected ${artifact.sizeBytes} bytes but found ${stat.size}.`,
        });
      }

      const actualSha256 = await this.calculateSha256(canonicalArtifactPath);

      const expectedSha256 = artifact.sha256.trim().toLowerCase();

      if (actualSha256 !== expectedSha256) {
        return Object.freeze({
          artifactId: artifact.id,

          filename: artifact.filename,

          status: "corrupt",

          exists: true,

          checksumVerified: false,

          actualSizeBytes: stat.size,

          expectedSizeBytes: artifact.sizeBytes,

          actualSha256,

          expectedSha256,

          reason: "Artifact SHA-256 checksum mismatch.",
        });
      }

      return Object.freeze({
        artifactId: artifact.id,

        filename: artifact.filename,

        status: "valid",

        exists: true,

        checksumVerified: true,

        actualSizeBytes: stat.size,

        expectedSizeBytes: artifact.sizeBytes,

        actualSha256,

        expectedSha256,

        reason: null,
      });
    } catch (error) {
      return Object.freeze({
        artifactId: artifact.id,

        filename: artifact.filename,

        status: "missing",

        exists: false,

        checksumVerified: false,

        actualSizeBytes: null,

        expectedSizeBytes: artifact.sizeBytes,

        actualSha256: null,

        expectedSha256: artifact.sha256,

        reason:
          error instanceof Error
            ? error.message
            : "Artifact could not be accessed.",
      });
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

      artifacts: Object.freeze([]),

      validArtifactCount: 0,

      requiredArtifactCount: 0,
    });
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
