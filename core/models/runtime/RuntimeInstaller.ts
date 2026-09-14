
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
  RuntimeManifest,
  readRuntimeManifest,
  writeRuntimeManifest,
} from "./RuntimeManifest";

import {
  RuntimePackage,
  RuntimePackageRegistry,
} from "./RuntimePackageRegistry";

import { RuntimeDownloader } from "./RuntimeDownloader";

const execFileAsync = promisify(execFile);

const RUNTIME_NAME = "llama_cpp";

export interface RuntimeInstallResult {
  readonly runtime: "llama_cpp";

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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException(
      "Operation was aborted.",
      "AbortError",
    );
  }
}

function isSafeVersion(value: string): boolean {
  return (
    Boolean(value) &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !value.includes("\0")
  );
}

function normalizeRelativePath(value: string): string {
  return value
    .split(path.sep)
    .join(path.posix.sep);
}

function isSafeRelativePath(value: string): boolean {
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

/**
 * RuntimeInstaller
 *
 * Responsibilities:
 *
 * - Reuse an already-installed verified llama.cpp runtime.
 * - Download llama.cpp only when no valid runtime exists.
 * - Verify the downloaded archive.
 * - Extract the runtime.
 * - Discover llama-server.exe.
 * - Write and verify runtime-manifest.json.
 * - Roll back incomplete installations.
 *
 * Runtime reuse strategy:
 *
 *     Existing valid runtime
 *             ↓
 *          REUSE
 *
 *     No valid runtime
 *             ↓
 *     Resolve official package
 *             ↓
 *          DOWNLOAD
 *             ↓
 *          INSTALL
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
   * Ensure that the llama.cpp runtime required by Veyra exists.
   *
   * Resolution order:
   *
   * 1. Reuse an existing verified managed runtime.
   * 2. If none exists, resolve the current official package.
   * 3. Download it.
   * 4. Install it.
   *
   * This makes the operation idempotent.
   */
  public async ensureLlamaCpp(
    options: {
      readonly signal?: AbortSignal;

      readonly onDownloadProgress?: (
        downloadedBytes: number,
        totalBytes?: number,
      ) => void;
    } = {},
  ): Promise<RuntimeInstallResult> {
    throwIfAborted(
      options.signal,
    );

    /*
     * ------------------------------------------------------------------------
     * STEP 1
     * ------------------------------------------------------------------------
     *
     * FIRST look for an already-installed managed runtime.
     *
     * This happens BEFORE RuntimePackageRegistry is queried.
     *
     * Therefore an installed b10947 runtime is reused even if GitHub now has
     * b10948 or another newer version.
     */
    const existingRuntime =
      await this.findExistingManagedRuntime(
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
     * STEP 2
     * ------------------------------------------------------------------------
     *
     * No valid managed runtime exists.
     *
     * Now resolve the official llama.cpp package.
     */
    const runtimePackage =
      await this.registry.resolveLlamaCpp({
        signal:
          options.signal,
      });

    throwIfAborted(
      options.signal,
    );

    if (
      !isSafeVersion(
        runtimePackage.version,
      )
    ) {
      throw new Error(
        `Unsafe llama.cpp runtime version "${runtimePackage.version}".`,
      );
    }

    /*
     * ------------------------------------------------------------------------
     * STEP 3
     * ------------------------------------------------------------------------
     *
     * Determine installation paths.
     */
    const runtimeDirectory =
      this.paths.getRuntimeVersionDirectory(
        RUNTIME_NAME,
        runtimePackage.version,
      );

    const manifestPath =
      this.paths.getRuntimeManifestPath(
        RUNTIME_NAME,
        runtimePackage.version,
      );

    /*
     * The package executable path is only the expected path.
     *
     * The archive may contain a top-level directory, so the actual path is
     * discovered during extraction.
     */
    const expectedExecutablePath =
      path.join(
        runtimeDirectory,
        runtimePackage.executableRelativePath,
      );

    /*
     * ------------------------------------------------------------------------
     * STEP 4
     * ------------------------------------------------------------------------
     *
     * Exact version reuse check.
     *
     * This protects against a race where another Veyra process installs the
     * exact runtime while this process is resolving the package.
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
     * STEP 5
     * ------------------------------------------------------------------------
     *
     * Remove incomplete/corrupt installation.
     */
    await fs.rm(
      runtimeDirectory,
      {
        recursive: true,
        force: true,
      },
    );

    const runtimeRoot =
      this.paths.getRuntimeDirectory(
        RUNTIME_NAME,
      );

    await fs.mkdir(
      runtimeRoot,
      {
        recursive: true,
      },
    );

    const stagingDirectory =
      path.join(
        runtimeRoot,
        `.${runtimePackage.version}.installing-${process.pid}-${Date.now()}`,
      );

    await fs.mkdir(
      stagingDirectory,
      {
        recursive: true,
      },
    );

    /*
     * ------------------------------------------------------------------------
     * STEP 6
     * ------------------------------------------------------------------------
     *
     * Download archive.
     *
     * Keep the .zip extension because Windows Expand-Archive requires it.
     */
    const cacheDirectory =
      this.paths.getCacheDirectory();

    await fs.mkdir(
      cacheDirectory,
      {
        recursive: true,
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

      /*
       * ----------------------------------------------------------------------
       * Download
       * ----------------------------------------------------------------------
       */
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
       * ----------------------------------------------------------------------
       * Extract
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
       * Find executable
       * ----------------------------------------------------------------------
       */
      const stagedExecutable =
        await this.findExecutable(
          stagingDirectory,
          runtimePackage.executableRelativePath,
        );

      /*
       * ----------------------------------------------------------------------
       * Determine actual executable path
       * ----------------------------------------------------------------------
       */
      const stagedRelativeExecutablePath =
        path.relative(
          stagingDirectory,
          stagedExecutable,
        );

      if (
        !stagedRelativeExecutablePath ||
        path.isAbsolute(
          stagedRelativeExecutablePath,
        ) ||
        stagedRelativeExecutablePath
          .split(path.sep)
          .includes("..")
      ) {
        throw new Error(
          "The discovered llama-server executable resolved outside the runtime staging directory.",
        );
      }

      const installedExecutableRelativePath =
        normalizeRelativePath(
          stagedRelativeExecutablePath,
        );

      if (
        !isSafeRelativePath(
          installedExecutableRelativePath,
        )
      ) {
        throw new Error(
          `The discovered llama-server executable path is unsafe: ${installedExecutableRelativePath}`,
        );
      }

      /*
       * ----------------------------------------------------------------------
       * Validate executable
       * ----------------------------------------------------------------------
       */
      await this.assertExecutable(
        stagedExecutable,
      );

      /*
       * ----------------------------------------------------------------------
       * Promote staging directory
       * ----------------------------------------------------------------------
       */
      await fs.rename(
        stagingDirectory,
        runtimeDirectory,
      );

      /*
       * ----------------------------------------------------------------------
       * Final executable
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
       * Create runtime manifest
       * ----------------------------------------------------------------------
       */
      const manifest: RuntimeManifest = {
        schemaVersion: 1,

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
          installedExecutableRelativePath,

        installedAt:
          new Date().toISOString(),
      };

      await writeRuntimeManifest(
        manifestPath,
        manifest,
      );

      /*
       * ----------------------------------------------------------------------
       * Verify manifest
       * ----------------------------------------------------------------------
       */
      const verifiedManifest =
        await readRuntimeManifest({
          manifestPath,
        });

      if (!verifiedManifest) {
        throw new Error(
          "Runtime manifest could not be read after installation.",
        );
      }

      if (
        verifiedManifest.packageSha256 !==
        runtimePackage.sha256
      ) {
        throw new Error(
          "Runtime manifest SHA-256 does not match the verified runtime package.",
        );
      }

      if (
        verifiedManifest.executableRelativePath !==
        installedExecutableRelativePath
      ) {
        throw new Error(
          "Runtime manifest executable path does not match the installed runtime executable.",
        );
      }

      /*
       * ----------------------------------------------------------------------
       * Final executable verification
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
       * Remove temporary archive
       * ----------------------------------------------------------------------
       */
      await fs.rm(
        archivePath,
        {
          force: true,
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
       * Installation rollback
       * ----------------------------------------------------------------------
       */
      await fs.rm(
        stagingDirectory,
        {
          recursive: true,
          force: true,
        },
      );

      await fs.rm(
        archivePath,
        {
          force: true,
        },
      );

      await fs.rm(
        runtimeDirectory,
        {
          recursive: true,
          force: true,
        },
      );

      throw new Error(
        `Failed to install llama.cpp runtime: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * ==========================================================================
   * Existing managed runtime discovery
   * ==========================================================================
   *
   * Searches:
   *
   * AppData\Local\Veyra\runtimes\llama_cpp\
   *
   * Example:
   *
   * llama_cpp/
   * ├── b10947/
   * │   ├── llama-server.exe
   * │   └── runtime-manifest.json
   * │
   * └── b10946/
   *     ├── llama-server.exe
   *     └── runtime-manifest.json
   *
   * The newest valid installed runtime is selected.
   *
   * IMPORTANT:
   *
   * This method does NOT query GitHub.
   */
  private async findExistingManagedRuntime(
    signal?: AbortSignal,
  ): Promise<RuntimeInstallResult | null> {
    throwIfAborted(
      signal,
    );

    const runtimeRoot =
      this.paths.getRuntimeDirectory(
        RUNTIME_NAME,
      );

    /*
     * Explicitly type the directory entries as Dirent<string>[].
     *
     * This avoids the Node.js fs.readdir overload ambiguity where TypeScript
     * can otherwise infer Dirent<NonSharedBuffer>[].
     */
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
          (
            entry,
          ) =>
            entry.isDirectory() &&
            isSafeVersion(
              entry.name,
            ) &&
            !entry.name.startsWith(
              ".",
            ),
        )
        .map(
          (
            entry,
          ) =>
            entry.name,
        )
        .sort(
          (
            a,
            b,
          ) =>
            this.compareRuntimeVersions(
              b,
              a,
            ),
        );

    /*
     * Newest valid runtime wins.
     *
     * If the newest directory is corrupt, continue looking for an older
     * valid runtime.
     */
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
          RUNTIME_NAME,
          version,
        );

      const manifest =
        await readRuntimeManifest({
          manifestPath,
        });

      if (!manifest) {
        continue;
      }

      /*
       * Validate manifest runtime identity.
       */
      if (
        manifest.runtime !==
        RUNTIME_NAME
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

      /*
       * Validate executable relative path.
       */
      if (
        !isSafeRelativePath(
          manifest.executableRelativePath,
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
         * Runtime is incomplete/corrupt.
         *
         * Do not delete it here. Continue searching.
         */
        continue;
      }

      /*
       * Validate stored package SHA.
       *
       * We do NOT redownload the archive just to verify this.
       *
       * The SHA was already verified during installation.
       */
      if (
        !manifest.packageSha256 ||
        !/^[a-fA-F0-9]{64}$/.test(
          manifest.packageSha256,
        )
      ) {
        continue;
      }

      /*
       * Valid managed runtime found.
       */
      return Object.freeze({
        runtime:
          RUNTIME_NAME,

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
   * ==========================================================================
   * Runtime version comparison
   * ==========================================================================
   *
   * llama.cpp versions normally look like:
   *
   *     b10947
   *     b10946
   *     b10945
   *
   * Numeric build versions are compared numerically.
   *
   * Unknown version formats fall back to natural lexical comparison.
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

  /**
   * ==========================================================================
   * Exact package/version reuse
   * ==========================================================================
   *
   * This protects against a race where another process installs the exact
   * runtime while this process is resolving the package.
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

    /*
     * Validate runtime identity.
     */
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

    /*
     * The installed runtime must correspond to the package selected by the
     * registry.
     */
    if (
      manifest.packageSha256 !==
      runtimePackage.sha256
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

    /*
     * Prefer executable path recorded in manifest.
     */
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
       * Backwards-compatible fallback for an older manifest.
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
        RUNTIME_NAME,

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
   * ==========================================================================
   * Archive extraction
   * ==========================================================================
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
        `Runtime archive must have a .zip extension before extraction. Received: ${archivePath}`,
      );
    }

    const powershell =
      process.env.ComSpec
        ? "powershell.exe"
        : "powershell";

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
   * ==========================================================================
   * Executable discovery
   * ==========================================================================
   */
  private async findExecutable(
    stagingDirectory: string,
    relativePath: string,
  ): Promise<string> {
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
       * Some release archives contain:
       *
       * llama-b10947-bin-win-cpu-x64/
       *     llama-server.exe
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
        `Runtime executable "${executableName}" was not found in the downloaded archive.`,
      );
    }

    if (
      matches.length >
      1
    ) {
      throw new Error(
        `Multiple runtime executables named "${executableName}" were found in the downloaded archive.`,
      );
    }

    return matches[0];
  }

  private async walkForFilename(
    directory: string,
    filename: string,
    matches: string[],
  ): Promise<void> {
    /*
     * Explicitly type this result as Dirent<string>[].
     *
     * This is important with the Node.js type definitions currently used by
     * this project because readdir() has multiple generic overloads.
     */
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

  /**
   * ==========================================================================
   * Executable validation
   * ==========================================================================
   */
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

  /**
   * ==========================================================================
   * PowerShell escaping
   * ==========================================================================
   */
  private quotePowerShell(
    value: string,
  ): string {
    return `'${value.replace(
      /'/g,
      "''",
    )}'`;
  }
}