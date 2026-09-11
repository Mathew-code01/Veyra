// core/models/storage/ModelManifest.ts

import type {
  ModelDefinition,
  ModelArtifact,
  ModelModality,
  ModelRuntime,
} from "../ModelRegistry";

export type ModelManifestStatus = "installed" | "corrupt" | "partial";

export interface ModelManifestArtifact {
  readonly id: string;

  readonly role: ModelArtifact["role"];

  readonly filename: string;

  readonly filePath: string;

  readonly sizeBytes: number;

  readonly sha256: string;
}

export interface ModelManifestPackage {
  readonly artifacts: readonly ModelManifestArtifact[];

  readonly requiredArtifactIds: readonly string[];

  readonly totalSizeBytes: number;

  readonly primaryArtifactId: string;
}

export interface ModelManifest {
  readonly manifestVersion: 2;

  readonly modelId: string;

  readonly modality: ModelModality;

  readonly runtime: ModelRuntime;

  readonly status: ModelManifestStatus;

  readonly installedAt: number;

  readonly updatedAt: number;

  readonly package: ModelManifestPackage;
}

export interface CreateModelManifestArtifactInput {
  readonly id: string;

  readonly role: ModelArtifact["role"];

  readonly filename: string;

  readonly filePath: string;

  readonly sizeBytes: number;

  readonly sha256: string;
}

function normalizeSha256(value: string): string {
  return value.trim().toLowerCase();
}

function validateArtifact(
  artifact: CreateModelManifestArtifactInput,
): ModelManifestArtifact {
  const id = artifact.id.trim();

  const filename = artifact.filename.trim();

  const filePath = artifact.filePath.trim();

  const sha256 = normalizeSha256(artifact.sha256);

  if (!id) {
    throw new Error("Manifest artifact id cannot be empty.");
  }

  if (!filename) {
    throw new Error(`Manifest artifact "${id}" has an empty filename.`);
  }

  if (!filePath) {
    throw new Error(`Manifest artifact "${id}" has an empty filePath.`);
  }

  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
    throw new Error(
      `Manifest artifact "${id}" has an invalid sizeBytes value.`,
    );
  }

  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`Manifest artifact "${id}" has an invalid SHA-256 value.`);
  }

  return Object.freeze({
    id,

    role: artifact.role,

    filename,

    filePath,

    sizeBytes: artifact.sizeBytes,

    sha256,
  });
}

export function createModelManifest(
  model: ModelDefinition,
  input: {
    readonly artifacts: readonly CreateModelManifestArtifactInput[];

    readonly requiredArtifactIds: readonly string[];

    readonly primaryArtifactId: string;

    readonly installedAt?: number;
  },
): ModelManifest {
  if (!model.package) {
    throw new Error(`Model "${model.id}" does not define a package.`);
  }

  const requiredIds = Object.freeze([
    ...new Set(input.requiredArtifactIds.map((id) => id.trim())),
  ]);

  if (requiredIds.length === 0) {
    throw new Error(
      `Model "${model.id}" must have at least one required package artifact.`,
    );
  }

  const artifacts = Object.freeze(input.artifacts.map(validateArtifact));

  const artifactIdSet = new Set(artifacts.map((artifact) => artifact.id));

  for (const requiredId of requiredIds) {
    if (!artifactIdSet.has(requiredId)) {
      throw new Error(
        `Manifest for "${model.id}" is missing required artifact "${requiredId}".`,
      );
    }
  }

  if (!artifactIdSet.has(input.primaryArtifactId)) {
    throw new Error(
      `Manifest for "${model.id}" references an unknown primary artifact "${input.primaryArtifactId}".`,
    );
  }

  const modelArtifact = artifacts.find((artifact) => artifact.role === "model");

  if (!modelArtifact) {
    throw new Error(
      `Manifest for "${model.id}" must contain a primary model artifact.`,
    );
  }

  if (modelArtifact.id !== input.primaryArtifactId) {
    throw new Error(
      `Manifest primary artifact must be the artifact with role "model".`,
    );
  }

  const totalSizeBytes = artifacts.reduce(
    (total, artifact) => total + artifact.sizeBytes,
    0,
  );

  const now = input.installedAt ?? Date.now();

  return Object.freeze({
    manifestVersion: 2,

    modelId: model.id,

    modality: model.modality,

    runtime: model.runtime,

    status: "installed",

    installedAt: now,

    updatedAt: now,

    package: Object.freeze({
      artifacts,

      requiredArtifactIds: requiredIds,

      totalSizeBytes,

      primaryArtifactId: input.primaryArtifactId,
    }),
  });
}

export function isModelManifestArtifact(
  value: unknown,
): value is ModelManifestArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.role === "string" &&
    typeof record.filename === "string" &&
    typeof record.filePath === "string" &&
    typeof record.sizeBytes === "number" &&
    Number.isSafeInteger(record.sizeBytes) &&
    typeof record.sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(record.sha256)
  );
}

export function isModelManifest(value: unknown): value is ModelManifest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    record.manifestVersion !== 2 ||
    typeof record.modelId !== "string" ||
    typeof record.modality !== "string" ||
    typeof record.runtime !== "string" ||
    typeof record.status !== "string" ||
    typeof record.installedAt !== "number" ||
    typeof record.updatedAt !== "number" ||
    !record.package ||
    typeof record.package !== "object"
  ) {
    return false;
  }

  const packageRecord = record.package as Record<string, unknown>;

  if (
    !Array.isArray(packageRecord.artifacts) ||
    !Array.isArray(packageRecord.requiredArtifactIds) ||
    typeof packageRecord.totalSizeBytes !== "number" ||
    typeof packageRecord.primaryArtifactId !== "string"
  ) {
    return false;
  }

  return (
    packageRecord.artifacts.every(isModelManifestArtifact) &&
    packageRecord.requiredArtifactIds.every((id) => typeof id === "string")
  );
}
