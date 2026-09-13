// core/models/runtime/RuntimeManifest.ts

import { promises as fs } from "node:fs";
import path from "node:path";

export interface RuntimeManifest {
  readonly schemaVersion: 1;

  readonly runtime: string;

  readonly version: string;

  readonly platform: NodeJS.Platform;

  readonly architecture: string;

  readonly variant: string;

  readonly packageName: string;

  readonly packageUrl: string;

  readonly packageSha256: string;

  readonly executableRelativePath: string;

  readonly installedAt: string;
}

export interface RuntimeManifestReadOptions {
  readonly manifestPath: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export async function readRuntimeManifest(
  options: RuntimeManifestReadOptions,
): Promise<RuntimeManifest | null> {
  const manifestPath = path.resolve(options.manifestPath.trim());

  if (!manifestPath) {
    throw new Error("Runtime manifest path cannot be empty.");
  }

  try {
    const contents = await fs.readFile(manifestPath, "utf8");

    const parsed: unknown = JSON.parse(contents);

    return validateRuntimeManifest(parsed, manifestPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      return null;
    }

    throw new Error(`Failed to read runtime manifest "${manifestPath}".`, {
      cause: error,
    });
  }
}

export async function writeRuntimeManifest(
  manifestPath: string,
  manifest: RuntimeManifest,
): Promise<void> {
  const normalizedPath = path.resolve(manifestPath.trim());

  if (!normalizedPath) {
    throw new Error("Runtime manifest path cannot be empty.");
  }

  const validated = validateRuntimeManifest(manifest, normalizedPath);

  const directory = path.dirname(normalizedPath);

  await fs.mkdir(directory, {
    recursive: true,
  });

  const temporaryPath = `${normalizedPath}.tmp`;

  const serialized = `${JSON.stringify(validated, null, 2)}\n`;

  await fs.writeFile(temporaryPath, serialized, "utf8");

  try {
    await fs.rename(temporaryPath, normalizedPath);
  } catch (error) {
    await fs.rm(temporaryPath, {
      force: true,
    });

    throw new Error(
      `Failed to atomically install runtime manifest "${normalizedPath}".`,
      {
        cause: error,
      },
    );
  }
}

export function validateRuntimeManifest(
  value: unknown,
  sourcePath = "runtime manifest",
): RuntimeManifest {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid ${sourcePath}: expected an object.`);
  }

  const record = value as Record<string, unknown>;

  if (record.schemaVersion !== 1) {
    throw new Error(`Unsupported ${sourcePath} schema version.`);
  }

  const requiredStrings = [
    "runtime",
    "version",
    "platform",
    "architecture",
    "variant",
    "packageName",
    "packageUrl",
    "packageSha256",
    "executableRelativePath",
    "installedAt",
  ] as const;

  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || !(record[key] as string).trim()) {
      throw new Error(
        `Invalid ${sourcePath}: "${key}" must be a non-empty string.`,
      );
    }
  }

  const packageSha256 = record.packageSha256 as string;

  if (!SHA256_PATTERN.test(packageSha256)) {
    throw new Error(
      `Invalid ${sourcePath}: packageSha256 must be a SHA-256 hash.`,
    );
  }

  const executableRelativePath = record.executableRelativePath as string;

  if (
    path.isAbsolute(executableRelativePath) ||
    executableRelativePath.includes("..")
  ) {
    throw new Error(`Invalid ${sourcePath}: executableRelativePath is unsafe.`);
  }

  return Object.freeze({
    schemaVersion: 1,

    runtime: record.runtime as string,

    version: record.version as string,

    platform: record.platform as NodeJS.Platform,

    architecture: record.architecture as string,

    variant: record.variant as string,

    packageName: record.packageName as string,

    packageUrl: record.packageUrl as string,

    packageSha256: packageSha256.toLowerCase(),

    executableRelativePath,

    installedAt: record.installedAt as string,
  });
}