// core/models/storage/ModelManifest.ts

import type {
  ModelDefinition,
  ModelModality,
  ModelRuntime,
} from "../ModelRegistry";

export const MODEL_MANIFEST_VERSION = 1 as const;

export type ModelManifestStatus = "installed" | "partial" | "corrupt";

export interface ModelManifest {
  readonly manifestVersion: typeof MODEL_MANIFEST_VERSION;

  readonly modelId: string;

  readonly displayName: string;

  readonly family: string;

  readonly modality: ModelModality;

  readonly runtime: ModelRuntime;

  readonly status: ModelManifestStatus;

  readonly installedAt: number;

  readonly verifiedAt: number;

  readonly updatedAt: number;

  readonly artifact: {
    readonly filename: string;
    readonly filePath: string;
    readonly sizeBytes: number;
    readonly sha256: string;
  };

  readonly source: {
    readonly url: string;
  };

  readonly license: {
    readonly name: string;
    readonly commercialUse: boolean;
    readonly redistributionAllowed: boolean;
    readonly attributionRequired: boolean;
  };
}

export interface ModelManifestArtifact {
  readonly filename: string;

  readonly filePath: string;

  readonly sizeBytes: number;

  readonly sha256: string;
}

export function createModelManifest(
  model: ModelDefinition,
  artifact: ModelManifestArtifact,
): ModelManifest {
  if (!model.artifact?.url) {
    throw new Error(`Model "${model.id}" has no artifact URL.`);
  }

  const sha256 = artifact.sha256.trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Invalid SHA-256 checksum for model "${model.id}".`);
  }

  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 0) {
    throw new Error(`Invalid artifact size for model "${model.id}".`);
  }

  const now = Date.now();

  return Object.freeze({
    manifestVersion: MODEL_MANIFEST_VERSION,

    modelId: model.id,

    displayName: model.displayName,

    family: model.family,

    modality: model.modality,

    runtime: model.runtime,

    status: "installed",

    installedAt: now,

    verifiedAt: now,

    updatedAt: now,

    artifact: Object.freeze({
      filename: artifact.filename,

      filePath: artifact.filePath,

      sizeBytes: artifact.sizeBytes,

      sha256,
    }),

    source: Object.freeze({
      url: model.artifact.url,
    }),

    license: Object.freeze({
      name: model.license.name,

      commercialUse: model.license.commercialUse,

      redistributionAllowed: model.license.redistributionAllowed,

      attributionRequired: model.license.attributionRequired,
    }),
  });
}
