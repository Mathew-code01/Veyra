// core/models/runtime/LlamaRuntimeLocator.ts

import { promises as fs } from "node:fs";

import path from "node:path";

import { ModelPaths } from "../storage/ModelPaths";

import { readRuntimeManifest } from "./RuntimeManifest";

export type LlamaRuntimeLocationSource =
  "explicit" | "environment" | "managed" | "legacy";

export interface LlamaRuntimeLocation {
  readonly executablePath: string;

  readonly runtimeDirectory: string;

  readonly source: LlamaRuntimeLocationSource;

  readonly version?: string;
}

export interface LlamaRuntimeLocatorOptions {
  readonly paths?: ModelPaths;

  readonly explicitExecutablePath?: string;

  readonly allowLegacyPaths?: boolean;
}

function isNonEmpty(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

export class LlamaRuntimeLocator {
  private readonly paths?: ModelPaths;

  private readonly explicitExecutablePath?: string;

  private readonly allowLegacyPaths: boolean;

  public constructor(options: LlamaRuntimeLocatorOptions = {}) {
    this.paths = options.paths;

    this.explicitExecutablePath =
      options.explicitExecutablePath?.trim() || undefined;

    this.allowLegacyPaths = options.allowLegacyPaths ?? true;
  }

  public async resolve(): Promise<LlamaRuntimeLocation | null> {
    /*
     * 1. Explicit developer/admin override.
     */
    if (isNonEmpty(this.explicitExecutablePath)) {
      const location = await this.tryExecutable(
        this.explicitExecutablePath,
        "explicit",
      );

      if (location) {
        return location;
      }
    }

    /*
     * 2. Preferred environment variable.
     */
    const preferredEnvironment = process.env.VEYRA_LLAMA_SERVER_PATH?.trim();

    if (isNonEmpty(preferredEnvironment)) {
      const location = await this.tryExecutable(
        preferredEnvironment,
        "environment",
      );

      if (location) {
        return location;
      }
    }

    /*
     * 3. Backwards-compatible environment
     * variable used by the current ModelSystem.
     */
    const legacyEnvironment = process.env.VEYRA_LLAMA_SERVER?.trim();

    if (isNonEmpty(legacyEnvironment)) {
      const location = await this.tryExecutable(
        legacyEnvironment,
        "environment",
      );

      if (location) {
        return location;
      }
    }

    /*
     * 4. Veyra-managed runtime.
     */
    if (this.paths) {
      const managed = await this.resolveManagedRuntime();

      if (managed) {
        return managed;
      }
    }

    /*
     * 5. Development fallback.
     *
     * These paths are intentionally last.
     */
    if (this.allowLegacyPaths) {
      const legacy = await this.resolveLegacyRuntime();

      if (legacy) {
        return legacy;
      }
    }

    return null;
  }

  public async require(): Promise<LlamaRuntimeLocation> {
    const location = await this.resolve();

    if (!location) {
      throw new Error(
        [
          "llama-server executable was not found.",
          "",
          "Veyra checked:",
          "1. explicit runtime path",
          "2. VEYRA_LLAMA_SERVER_PATH",
          "3. VEYRA_LLAMA_SERVER",
          "4. Veyra managed runtime directory",
          "5. legacy development paths",
        ].join("\n"),
      );
    }

    return location;
  }

  private async resolveManagedRuntime(): Promise<LlamaRuntimeLocation | null> {
    const runtimeDirectory = this.paths!.getRuntimeDirectory("llama_cpp");

    let entries;

    try {
      entries = await fs.readdir(runtimeDirectory, {
        withFileTypes: true,
      });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        return null;
      }

      throw error;
    }

    const versions = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const version of versions) {
      const versionDirectory = path.join(runtimeDirectory, version);

      const manifestPath = this.paths!.getRuntimeManifestPath(
        "llama_cpp",
        version,
      );

      const manifest = await readRuntimeManifest({
        manifestPath,
      }).catch(() => null);

      if (!manifest) {
        continue;
      }

      if (manifest.runtime !== "llama_cpp") {
        continue;
      }

      const executablePath = path.join(
        versionDirectory,
        manifest.executableRelativePath,
      );

      const executableExists = await this.isFile(executablePath);

      if (!executableExists) {
        continue;
      }

      return Object.freeze({
        executablePath,

        runtimeDirectory: versionDirectory,

        source: "managed",

        version: manifest.version,
      });
    }

    return null;
  }

  private async resolveLegacyRuntime(): Promise<LlamaRuntimeLocation | null> {
    const projectRoot = process.cwd();

    const candidates = [
      path.join(projectRoot, "llama-server.exe"),

      path.join(projectRoot, "llama-server"),

      path.join(projectRoot, "bin", "llama-server.exe"),

      path.join(projectRoot, "bin", "llama-server"),

      path.join(projectRoot, "bin", "llama", "llama-server.exe"),

      path.join(projectRoot, "bin", "llama", "llama-server"),
    ];

    for (const candidate of candidates) {
      const location = await this.tryExecutable(candidate, "legacy");

      if (location) {
        return location;
      }
    }

    return null;
  }

  private async tryExecutable(
    executablePath: string,
    source: LlamaRuntimeLocationSource,
  ): Promise<LlamaRuntimeLocation | null> {
    const normalized = path.resolve(executablePath.trim());

    if (!(await this.isFile(normalized))) {
      return null;
    }

    return Object.freeze({
      executablePath: normalized,

      runtimeDirectory: path.dirname(normalized),

      source,
    });
  }

  private async isFile(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);

      return stat.isFile();
    } catch {
      return false;
    }
  }
}