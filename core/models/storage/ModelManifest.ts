// core/models/storage/ModelManifest.ts

import type {
  ModelDefinition,
  ModelModality,
  ModelRuntime,
} from "../ModelRegistry";

export const MODEL_MANIFEST_VERSION = 1 as const;

export interface ModelManifest {
  readonly manifestVersion: typeof MODEL_MANIFEST_VERSION;

  readonly modelId: string;
  readonly displayName: string;
  readonly family: string;

  readonly modality: ModelModality;
  readonly runtime: ModelRuntime;

  readonly installedAt: number;
  readonly verifiedAt: number;

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
  };
}

export function createModelManifest(
  model: ModelDefinition,
  artifact: {
    readonly filename: string;
    readonly filePath: string;
    readonly sizeBytes: number;
    readonly sha256: string;
  },
): ModelManifest {
  if (!model.artifact?.url) {
    throw new Error(`Model "${model.id}" has no artifact URL.`);
  }

  const timestamp = Date.now();

  return Object.freeze({
    manifestVersion: MODEL_MANIFEST_VERSION,

    modelId: model.id,
    displayName: model.displayName,
    family: model.family,

    modality: model.modality,
    runtime: model.runtime,

    installedAt: timestamp,
    verifiedAt: timestamp,

    artifact: Object.freeze({
      filename: artifact.filename,
      filePath: artifact.filePath,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
    }),

    source: Object.freeze({
      url: model.artifact.url,
    }),

    license: Object.freeze({
      name: model.license.name,
      commercialUse: model.license.commercialUse,
      redistributionAllowed: model.license.redistributionAllowed,
    }),
  });
}