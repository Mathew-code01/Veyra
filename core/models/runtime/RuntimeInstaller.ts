
// core/models/runtime/RuntimeInstaller.ts

import {
  promises as fs,
  type Dirent,
} from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

import { ModelPaths } from "../storage/ModelPaths";

import {
  readRuntimeManifest,
  writeRuntimeManifest,
  type RuntimeManifest,
} from "./RuntimeManifest";

import {
  type ManagedRuntimeKind,
  type RuntimePackage,
  RuntimePackageRegistry,
} from "./RuntimePackageRegistry";

import { RuntimeDownloader } from "./RuntimeDownloader";

const execFileAsync = promisify(execFile);

export interface RuntimeInstallResult {
  readonly runtime: ManagedRuntimeKind;

  readonly version: string;

  readonly executablePath: string;

  readonly runtimeDirectory: string;

  readonly manifestPath: string;

  readonly packageName: string;

  readonly packageSha256: string;

  readonly downloaded: boolean;

  readonly bytesDownloaded: number;

  readonly releaseUrl: string;
}

export interface RuntimeInstallerOptions {
  readonly paths: ModelPaths;

  readonly registry?: RuntimePackageRegistry;

  readonly downloader?: RuntimeDownloader;
}

interface RuntimeInstallOptions {
  readonly signal?: AbortSignal;

  readonly onDownloadProgress?: (
    downloadedBytes: number,
    totalBytes?: number,
  ) => void;
}

function throwIfAborted(
  signal?: AbortSignal,
): void {
  if (signal?.aborted) {
    throw new DOMException(
      "Operation was aborted.",
      "AbortError",
    );
  }
}

function isSafeVersion(
  value: string,
): boolean {
  return (
    Boolean(value) &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

function normalizeRelativePath(
  value: string,
): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
}

function isSafeRelativePath(
  value: string,
): boolean {
  if (
    !value ||
    path.isAbsolute(value)
  ) {
    return false;
  }

  const normalized =
    value.replace(
      /\\/g,
      "/",
    );

  if (
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return false;
  }

  const segments =
    normalized.split("/");

  return !segments.some(
    (segment) =>
      segment === "..",
  );
}

function isHexSha256(
  value: string,
): boolean {
  return /^[a-f0-9]{64}$/i.test(
    value,
  );
}

function getRuntimeDisplayName(
  runtime: ManagedRuntimeKind,
): string {
  switch (runtime) {
    case "llama_cpp":
      return "llama.cpp";

    case "whisper_cpp":
      return "whisper.cpp";

    default: {
      const exhaustiveCheck: never =
        runtime;

      return String(
        exhaustiveCheck,
      );
    }
  }
}

/**
 * RuntimeInstaller
 *
 * Installs and reuses Veyra-managed executable runtimes.
 *
 * Managed runtimes:
 *
 *     llama_cpp
 *     whisper_cpp
 *
 * Model packages such as Kokoro are deliberately NOT installed here.
 *
 * Kokoro's:
 *
 *     model_fp16.onnx
 *     af.bin
 *
 * are model artifacts and belong to ModelInstallationManager /
 * ModelStorage.
 */
export class RuntimeInstaller {
  private readonly paths: ModelPaths;

  private readonly registry: RuntimePackageRegistry;

  private readonly downloader: RuntimeDownloader;

  public constructor(
    options: RuntimeInstallerOptions,
  ) {
    this.paths =
      options.paths;

    this.registry =
      options.registry ??
      new RuntimePackageRegistry();

    this.downloader =
      options.downloader ??
      new RuntimeDownloader();
  }

  /**
   * Ensure llama.cpp exists.
   *
   * Existing valid managed runtime is reused before GitHub is queried.
   */
  public async ensureLlamaCpp(
    options: RuntimeInstallOptions = {},
  ): Promise<RuntimeInstallResult> {
    return this.ensureRuntime(
      "llama_cpp",
      options,
    );
  }

  /**
   * Ensure whisper.cpp exists.
   *
   * Existing valid managed runtime is reused before GitHub is queried.
   */
  public async ensureWhisperCpp(
    options: RuntimeInstallOptions = {},
  ): Promise<RuntimeInstallResult> {
    return this.ensureRuntime(
      "whisper_cpp",
      options,
    );
  }

  /**
   * Generic managed runtime installer.
   *
   * This is the main implementation used by the runtime-specific methods.
   */
  public async ensureRuntime(
    runtime: ManagedRuntimeKind,
    options: RuntimeInstallOptions = {},
  ): Promise<RuntimeInstallResult> {
    throwIfAborted(
      options.signal,
    );

    /*
     * ------------------------------------------------------------------------
     * STEP 1 — Reuse existing managed runtime
     * ------------------------------------------------------------------------
     *
     * Do this before contacting GitHub.
     *
     * This means:
     *
     *   installed b10947
     *
     * remains reusable even when GitHub now publishes b10948.
     */
    const existingRuntime =
      await this.findExistingManagedRuntime(
        runtime,
        options.signal,
      );

    if (existingRuntime) {
      return existingRuntime;
    }

    throwIfAborted(
      options.signal,
    );

    /*
     * ------------------------------------------------------------------------
     * STEP 2 — Resolve official package
     * ------------------------------------------------------------------------
     */
    const runtimePackage =
      await this.registry.resolve(
        runtime,
        {
          signal:
            options.signal,
        },
      );

    throwIfAborted(
      options.signal,
    );

    if (
      runtimePackage.runtime !==
      runtime
    ) {
      throw new Error(
        `Runtime registry returned "${runtimePackage.runtime}" while ` +
          `"${runtime}" was requested.`,
      );
    }

    if (
      !isSafeVersion(
        runtimePackage.version,
      )
    ) {
      throw new Error(
        `Unsafe ${getRuntimeDisplayName(runtime)} runtime version ` +
          `"${runtimePackage.version}".`,
      );
    }

    if (
      !isHexSha256(
        runtimePackage.sha256,
      )
    ) {
      throw new Error(
        `The ${getRuntimeDisplayName(runtime)} runtime package does not ` +
          `contain a valid SHA-256 digest.`,
      );
    }

    /*
     * ------------------------------------------------------------------------
     * STEP 3 — Determine paths
     * ------------------------------------------------------------------------
     */
    const runtimeDirectory =
      this.paths.getRuntimeVersionDirectory(
        runtime,
        runtimePackage.version,
      );

    const manifestPath =
      this.paths.getRuntimeManifestPath(
        runtime,
        runtimePackage.version,
      );

    const expectedExecutablePath =
      path.join(
        runtimeDirectory,
        runtimePackage.executableRelativePath,
      );

    /*
     * ------------------------------------------------------------------------
     * STEP 4 — Exact version race protection
     * ------------------------------------------------------------------------
     */
    const existingExact =
      await this.tryUseExistingRuntime(
        runtimePackage,
        runtimeDirectory,
        manifestPath,
        expectedExecutablePath,
      );

    if (existingExact) {
      return existingExact;
    }

    /*
     * ------------------------------------------------------------------------
     * STEP 5 — Remove incomplete installation
     * ------------------------------------------------------------------------
     */
    await fs.rm(
      runtimeDirectory,
      {
        recursive:
          true,
        force:
          true,
      },
    );

    const runtimeRoot =
      this.paths.getRuntimeDirectory(
        runtime,
      );

    await fs.mkdir(
      runtimeRoot,
      {
        recursive:
          true,
      },
    );

    const stagingDirectory =
      path.join(
        runtimeRoot,
        `.${runtimePackage.version}.installing-` +
          `${process.pid}-${Date.now()}`,
      );

    await fs.mkdir(
      stagingDirectory,
      {
        recursive:
          true,
      },
    );

    /*
     * ------------------------------------------------------------------------
     * STEP 6 — Download package
     * ------------------------------------------------------------------------
     */
    const cacheDirectory =
      this.paths.getCacheDirectory();

    await fs.mkdir(
      cacheDirectory,
      {
        recursive:
          true,
      },
    );

    const archivePath =
      path.join(
        cacheDirectory,
        runtimePackage.packageName,
      );

    try {
      throwIfAborted(
        options.signal,
      );

      const downloadResult =
        await this.downloader.download(
          runtimePackage,
          archivePath,
          {
            signal:
              options.signal,

            onProgress:
              options.onDownloadProgress,
          },
        );

      throwIfAborted(
        options.signal,
      );

      /*
       * RuntimeDownloader is responsible for package SHA verification.
       *
       * Still validate the returned value before installing anything.
       */
      if (
        downloadResult.sha256.toLowerCase() !==
        runtimePackage.sha256.toLowerCase()
      ) {
        throw new Error(
          `${getRuntimeDisplayName(runtime)} downloaded package SHA-256 ` +
            `does not match the registry digest.`,
        );
      }

      /*
       * ----------------------------------------------------------------------
       * STEP 7 — Extract archive
       * ----------------------------------------------------------------------
       */
      await this.extractArchive(
        downloadResult.filePath,
        stagingDirectory,
        options.signal,
      );

      throwIfAborted(
        options.signal,
      );

      /*
       * ----------------------------------------------------------------------
       * STEP 8 — Locate executable
       * ----------------------------------------------------------------------
       */
      const stagedExecutable =
        await this.findExecutable(
          stagingDirectory,
          runtimePackage.executableRelativePath,
        );

      /*
       * ----------------------------------------------------------------------
       * STEP 9 — Validate discovered path
       * ----------------------------------------------------------------------
       */
      const stagedRelativeExecutablePath =
        normalizeRelativePath(
          path.relative(
            stagingDirectory,
            stagedExecutable,
          ),
        );

      if (
        !stagedRelativeExecutablePath ||
        !isSafeRelativePath(
          stagedRelativeExecutablePath,
        )
      ) {
        throw new Error(
          `The discovered ${getRuntimeDisplayName(runtime)} executable ` +
            `resolved outside the runtime staging directory.`,
        );
      }

      /*
       * ----------------------------------------------------------------------
       * STEP 10 — Validate executable
       * ----------------------------------------------------------------------
       */
      await this.assertExecutable(
        stagedExecutable,
      );

      /*
       * ----------------------------------------------------------------------
       * STEP 11 — Promote staging directory
       * ----------------------------------------------------------------------
       */
      await fs.rename(
        stagingDirectory,
        runtimeDirectory,
      );

      /*
       * ----------------------------------------------------------------------
       * STEP 12 — Final executable
       * ----------------------------------------------------------------------
       */
      const finalExecutable =
        path.join(
          runtimeDirectory,
          stagedRelativeExecutablePath,
        );

      await this.assertExecutable(
        finalExecutable,
      );

      /*
       * ----------------------------------------------------------------------
       * STEP 13 — Write runtime manifest
       * ----------------------------------------------------------------------
       */
      const manifest: RuntimeManifest = {
        schemaVersion:
          1,

        runtime:
          runtimePackage.runtime,

        version:
          runtimePackage.version,

        platform:
          runtimePackage.platform,

        architecture:
          runtimePackage.architecture,

        variant:
          runtimePackage.variant,

        packageName:
          runtimePackage.packageName,

        packageUrl:
          runtimePackage.downloadUrl,

        packageSha256:
          downloadResult.sha256,

        executableRelativePath:
          stagedRelativeExecutablePath,

        installedAt:
          new Date().toISOString(),
      };

      await writeRuntimeManifest(
        manifestPath,
        manifest,
      );

      /*
       * ----------------------------------------------------------------------
       * STEP 14 — Read manifest back
       * ----------------------------------------------------------------------
       */
      const verifiedManifest =
        await readRuntimeManifest({
          manifestPath,
        });

      if (!verifiedManifest) {
        throw new Error(
          `${getRuntimeDisplayName(runtime)} runtime manifest could not ` +
            `be read after installation.`,
        );
      }

      /*
       * ----------------------------------------------------------------------
       * STEP 15 — Verify manifest identity
       * ----------------------------------------------------------------------
       */
      if (
        verifiedManifest.runtime !==
        runtimePackage.runtime
      ) {
        throw new Error(
          "Runtime manifest runtime identity does not match the installed package.",
        );
      }

      if (
        verifiedManifest.version !==
        runtimePackage.version
      ) {
        throw new Error(
          "Runtime manifest version does not match the installed package.",
        );
      }

      if (
        verifiedManifest.platform !==
        runtimePackage.platform
      ) {
        throw new Error(
          "Runtime manifest platform does not match the installed package.",
        );
      }

      if (
        verifiedManifest.architecture !==
        runtimePackage.architecture
      ) {
        throw new Error(
          "Runtime manifest architecture does not match the installed package.",
        );
      }

      if (
        verifiedManifest.variant !==
        runtimePackage.variant
      ) {
        throw new Error(
          "Runtime manifest variant does not match the installed package.",
        );
      }

      if (
        verifiedManifest.packageSha256.toLowerCase() !==
        runtimePackage.sha256.toLowerCase()
      ) {
        throw new Error(
          "Runtime manifest SHA-256 does not match the verified runtime package.",
        );
      }

      if (
        !isSafeRelativePath(
          verifiedManifest.executableRelativePath,
        )
      ) {
        throw new Error(
          "Runtime manifest contains an unsafe executable path.",
        );
      }

      /*
       * ----------------------------------------------------------------------
       * STEP 16 — Verify final executable from manifest
       * ----------------------------------------------------------------------
       */
      const manifestExecutablePath =
        path.join(
          runtimeDirectory,
          verifiedManifest.executableRelativePath,
        );

      await this.assertExecutable(
        manifestExecutablePath,
      );

      /*
       * ----------------------------------------------------------------------
       * STEP 17 — Remove archive only after successful installation
       * ----------------------------------------------------------------------
       */
      await fs.rm(
        archivePath,
        {
          force:
            true,
        },
      );

      return Object.freeze({
        runtime:
          runtimePackage.runtime,

        version:
          runtimePackage.version,

        executablePath:
          manifestExecutablePath,

        runtimeDirectory,

        manifestPath,

        packageName:
          runtimePackage.packageName,

        packageSha256:
          verifiedManifest.packageSha256,

        downloaded:
          true,

        bytesDownloaded:
          downloadResult.bytesDownloaded,

        releaseUrl:
          runtimePackage.releaseUrl,
      });
    } catch (error) {
      /*
       * ----------------------------------------------------------------------
       * ROLLBACK
       * ----------------------------------------------------------------------
       */
      await fs.rm(
        stagingDirectory,
        {
          recursive:
            true,
          force:
            true,
        },
      );

      await fs.rm(
        archivePath,
        {
          force:
            true,
        },
      );

      await fs.rm(
        runtimeDirectory,
        {
          recursive:
            true,
          force:
            true,
        },
      );

      throw new Error(
        `Failed to install ${getRuntimeDisplayName(runtime)} runtime: ` +
          `${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        {
          cause:
            error,
        },
      );
    }
  }

  /**
   * Find the newest valid managed runtime.
   *
   * GitHub is NOT queried here.
   */
  private async findExistingManagedRuntime(
    runtime: ManagedRuntimeKind,
    signal?: AbortSignal,
  ): Promise<RuntimeInstallResult | null> {
    throwIfAborted(
      signal,
    );

    const runtimeRoot =
      this.paths.getRuntimeDirectory(
        runtime,
      );

    let entries: Dirent<string>[];

    try {
      entries =
        await fs.readdir(
          runtimeRoot,
          {
            withFileTypes:
              true,
            encoding:
              "utf8",
          },
        );
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error
          ? String(
              (
                error as {
                  code?: unknown;
                }
              ).code,
            )
          : "";

      if (
        code === "ENOENT"
      ) {
        return null;
      }

      throw error;
    }

    const versions =
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            isSafeVersion(
              entry.name,
            ) &&
            !entry.name.startsWith("."),
        )
        .map(
          (entry) =>
            entry.name,
        )
        .sort(
          (a, b) =>
            this.compareRuntimeVersions(
              b,
              a,
            ),
        );

    for (
      const version of versions
    ) {
      throwIfAborted(
        signal,
      );

      const runtimeDirectory =
        path.join(
          runtimeRoot,
          version,
        );

      const manifestPath =
        this.paths.getRuntimeManifestPath(
          runtime,
          version,
        );

      const manifest =
        await readRuntimeManifest({
          manifestPath,
        });

      if (!manifest) {
        continue;
      }

      if (
        manifest.runtime !==
        runtime
      ) {
        continue;
      }

      if (
        manifest.version !==
        version
      ) {
        continue;
      }

      if (
        !isSafeVersion(
          manifest.version,
        )
      ) {
        continue;
      }

      if (
        manifest.platform !==
        process.platform
      ) {
        continue;
      }

      if (
        manifest.architecture !==
        this.getCurrentArchitecture()
      ) {
        continue;
      }

      if (
        !isSafeRelativePath(
          manifest.executableRelativePath,
        )
      ) {
        continue;
      }

      if (
        !isHexSha256(
          manifest.packageSha256,
        )
      ) {
        continue;
      }

      const executablePath =
        path.join(
          runtimeDirectory,
          manifest.executableRelativePath,
        );

      try {
        await this.assertExecutable(
          executablePath,
        );
      } catch {
        /*
         * Corrupt/incomplete runtime.
         *
         * Do not delete it while scanning.
         */
        continue;
      }

      return Object.freeze({
        runtime:
          runtime,

        version:
          manifest.version,

        executablePath,

        runtimeDirectory,

        manifestPath,

        packageName:
          manifest.packageName,

        packageSha256:
          manifest.packageSha256,

        downloaded:
          false,

        bytesDownloaded:
          0,

        releaseUrl:
          manifest.packageUrl,
      });
    }

    return null;
  }

  /**
   * Exact package/version reuse.
   *
   * Used after resolving a package from GitHub in case another process
   * installed that exact version between the initial scan and resolution.
   */
  private async tryUseExistingRuntime(
    runtimePackage: RuntimePackage,
    runtimeDirectory: string,
    manifestPath: string,
    expectedExecutablePath: string,
  ): Promise<RuntimeInstallResult | null> {
    const manifest =
      await readRuntimeManifest({
        manifestPath,
      });

    if (!manifest) {
      return null;
    }

    if (
      manifest.runtime !==
      runtimePackage.runtime
    ) {
      return null;
    }

    if (
      manifest.version !==
      runtimePackage.version
    ) {
      return null;
    }

    if (
      manifest.platform !==
      runtimePackage.platform
    ) {
      return null;
    }

    if (
      manifest.architecture !==
      runtimePackage.architecture
    ) {
      return null;
    }

    if (
      manifest.variant !==
      runtimePackage.variant
    ) {
      return null;
    }

    if (
      manifest.packageSha256.toLowerCase() !==
      runtimePackage.sha256.toLowerCase()
    ) {
      return null;
    }

    if (
      !isSafeRelativePath(
        manifest.executableRelativePath,
      )
    ) {
      return null;
    }

    const manifestExecutablePath =
      path.join(
        runtimeDirectory,
        manifest.executableRelativePath,
      );

    try {
      await this.assertExecutable(
        manifestExecutablePath,
      );
    } catch {
      /*
       * Backwards-compatible fallback.
       */
      try {
        await this.assertExecutable(
          expectedExecutablePath,
        );
      } catch {
        return null;
      }
    }

    const executablePath =
      await this.resolveManifestExecutable(
        runtimeDirectory,
        manifest,
        expectedExecutablePath,
      );

    return Object.freeze({
      runtime:
        runtimePackage.runtime,

      version:
        manifest.version,

      executablePath,

      runtimeDirectory,

      manifestPath,

      packageName:
        manifest.packageName,

      packageSha256:
        manifest.packageSha256,

      downloaded:
        false,

      bytesDownloaded:
        0,

      releaseUrl:
        manifest.packageUrl,
    });
  }

  private async resolveManifestExecutable(
    runtimeDirectory: string,
    manifest: RuntimeManifest,
    fallbackPath: string,
  ): Promise<string> {
    if (
      !isSafeRelativePath(
        manifest.executableRelativePath,
      )
    ) {
      throw new Error(
        "Runtime manifest contains an unsafe executable path.",
      );
    }

    const manifestExecutablePath =
      path.join(
        runtimeDirectory,
        manifest.executableRelativePath,
      );

    try {
      await this.assertExecutable(
        manifestExecutablePath,
      );

      return manifestExecutablePath;
    } catch {
      await this.assertExecutable(
        fallbackPath,
      );

      return fallbackPath;
    }
  }

  /**
   * Extract a Windows ZIP archive.
   */
  private async extractArchive(
    archivePath: string,
    destinationDirectory: string,
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfAborted(
      signal,
    );

    if (
      process.platform !==
      "win32"
    ) {
      throw new Error(
        "Automatic runtime archive extraction is currently implemented for Windows.",
      );
    }

    if (
      !archivePath
        .toLowerCase()
        .endsWith(".zip")
    ) {
      throw new Error(
        `Runtime archive must have a .zip extension before extraction. ` +
          `Received: ${archivePath}`,
      );
    }

    const powershell =
      "powershell.exe";

    const script = [
      "$ErrorActionPreference = 'Stop';",

      `Expand-Archive -LiteralPath ${this.quotePowerShell(
        archivePath,
      )} ` +
        `-DestinationPath ${this.quotePowerShell(
          destinationDirectory,
        )} ` +
        "-Force;",
    ].join(" ");

    await execFileAsync(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        windowsHide:
          true,

        maxBuffer:
          10 * 1024 * 1024,

        signal,
      },
    );
  }

  /**
   * Locate the expected executable.
   *
   * Archives sometimes contain a top-level directory:
   *
   * llama-b10947-bin-win-cpu-x64/
   *     llama-server.exe
   *
   * or:
   *
   * Release/
   *     whisper-cli.exe
   */
  private async findExecutable(
    stagingDirectory: string,
    relativePath: string,
  ): Promise<string> {
    if (
      !isSafeRelativePath(
        relativePath,
      )
    ) {
      throw new Error(
        `Unsafe runtime executable path: ${relativePath}`,
      );
    }

    const directPath =
      path.join(
        stagingDirectory,
        relativePath,
      );

    try {
      await this.assertExecutable(
        directPath,
      );

      return directPath;
    } catch {
      /*
       * Fall back to filename discovery.
       */
    }

    const executableName =
      path.basename(
        relativePath,
      );

    const matches: string[] =
      [];

    await this.walkForFilename(
      stagingDirectory,
      executableName,
      matches,
    );

    if (
      matches.length ===
      0
    ) {
      throw new Error(
        `Runtime executable "${executableName}" was not found in ` +
          `the downloaded archive.`,
      );
    }

    if (
      matches.length >
      1
    ) {
      /*
       * Prefer a path whose suffix matches the expected relative path.
       *
       * Example:
       *
       * Release/whisper-cli.exe
       */
      const expectedNormalized =
        normalizeRelativePath(
          relativePath,
        ).toLowerCase();

      const preferred =
        matches.filter(
          (match) => {
            const relative =
              normalizeRelativePath(
                path.relative(
                  stagingDirectory,
                  match,
                ),
              ).toLowerCase();

            return (
              relative ===
              expectedNormalized
            );
          },
        );

      if (
        preferred.length ===
        1
      ) {
        return preferred[0];
      }

      throw new Error(
        `Multiple runtime executables named "${executableName}" were found ` +
          `in the downloaded archive.`,
      );
    }

    return matches[0];
  }

  private async walkForFilename(
    directory: string,
    filename: string,
    matches: string[],
  ): Promise<void> {
    const entries: Dirent<string>[] =
      await fs.readdir(
        directory,
        {
          withFileTypes:
            true,
          encoding:
            "utf8",
        },
      );

    for (
      const entry of entries
    ) {
      const fullPath =
        path.join(
          directory,
          entry.name,
        );

      if (
        entry.isDirectory()
      ) {
        await this.walkForFilename(
          fullPath,
          filename,
          matches,
        );

        continue;
      }

      if (
        entry.isFile() &&
        entry.name.toLowerCase() ===
          filename.toLowerCase()
      ) {
        matches.push(
          fullPath,
        );
      }
    }
  }

  private async assertExecutable(
    executablePath: string,
  ): Promise<void> {
    const stat =
      await fs.stat(
        executablePath,
      );

    if (
      !stat.isFile()
    ) {
      throw new Error(
        `Runtime executable is not a regular file: ${executablePath}`,
      );
    }

    await fs.access(
      executablePath,
    );
  }

  private getCurrentArchitecture(): string {
    switch (process.arch) {
      case "x64":
        return "x64";

      case "arm64":
        return "arm64";

      case "arm":
        return "arm";

      case "ia32":
        return "ia32";

      default:
        return process.arch;
    }
  }

  /**
   * Compare runtime versions.
   *
   * llama.cpp builds:
   *
   *     b10947
   *     b10946
   *
   * are compared numerically.
   */
  private compareRuntimeVersions(
    left: string,
    right: string,
  ): number {
    const leftBuild =
      this.extractBuildNumber(
        left,
      );

    const rightBuild =
      this.extractBuildNumber(
        right,
      );

    if (
      leftBuild !== null &&
      rightBuild !== null
    ) {
      return (
        leftBuild -
        rightBuild
      );
    }

    return left.localeCompare(
      right,
      undefined,
      {
        numeric:
          true,
        sensitivity:
          "base",
      },
    );
  }

  private extractBuildNumber(
    version: string,
  ): number | null {
    const match =
      /^b(\d+)$/i.exec(
        version.trim(),
      );

    if (!match) {
      return null;
    }

    const value =
      Number(
        match[1],
      );

    return Number.isSafeInteger(
      value,
    )
      ? value
      : null;
  }

  private quotePowerShell(
    value: string,
  ): string {
    return `'${value.replace(
      /'/g,
      "''",
    )}'`;
  }
}
