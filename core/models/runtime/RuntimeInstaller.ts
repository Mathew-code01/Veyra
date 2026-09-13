// core/models/runtime/RuntimeInstaller.ts

import { promises as fs } from "node:fs";
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
    throw new DOMException("Operation was aborted.", "AbortError");
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
  return value.split(path.sep).join(path.posix.sep);
}

export class RuntimeInstaller {
  private readonly paths: ModelPaths;

  private readonly registry: RuntimePackageRegistry;

  private readonly downloader: RuntimeDownloader;

  public constructor(options: RuntimeInstallerOptions) {
    this.paths = options.paths;

    this.registry = options.registry ?? new RuntimePackageRegistry();

    this.downloader = options.downloader ?? new RuntimeDownloader();
  }

  /**
   * Ensure that the llama.cpp runtime required by Veyra exists.
   *
   * This method is idempotent:
   *
   * - existing verified runtime => reused
   * - missing runtime => downloaded
   * - incomplete/corrupt runtime => removed and reinstalled
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
    throwIfAborted(options.signal);

    /*
     * ------------------------------------------------------------------------
     * Resolve the official runtime package
     * ------------------------------------------------------------------------
     */

    const runtimePackage = await this.registry.resolveLlamaCpp({
      signal: options.signal,
    });

    throwIfAborted(options.signal);

    if (!isSafeVersion(runtimePackage.version)) {
      throw new Error(
        `Unsafe llama.cpp runtime version "${runtimePackage.version}".`,
      );
    }

    /*
     * ------------------------------------------------------------------------
     * Determine installation paths
     * ------------------------------------------------------------------------
     */

    const runtimeDirectory = this.paths.getRuntimeVersionDirectory(
      "llama_cpp",
      runtimePackage.version,
    );

    const manifestPath = this.paths.getRuntimeManifestPath(
      "llama_cpp",
      runtimePackage.version,
    );

    /*
     * Do NOT assume that the package executable is necessarily at the
     * archive root.
     *
     * We use the package path when checking a normal installation, but
     * the manifest can later contain the actual relative executable path
     * discovered inside the archive.
     */

    const expectedExecutablePath = path.join(
      runtimeDirectory,
      runtimePackage.executableRelativePath,
    );

    /*
     * ------------------------------------------------------------------------
     * Existing installation
     * ------------------------------------------------------------------------
     */

    const existing = await this.tryUseExistingRuntime(
      runtimePackage,
      runtimeDirectory,
      manifestPath,
      expectedExecutablePath,
    );

    if (existing) {
      return Object.freeze({
        ...existing,

        downloaded: false,

        bytesDownloaded: 0,
      });
    }

    /*
     * ------------------------------------------------------------------------
     * Remove incomplete/corrupt installation
     * ------------------------------------------------------------------------
     */

    await fs.rm(runtimeDirectory, {
      recursive: true,
      force: true,
    });

    const runtimeRoot = this.paths.getRuntimeDirectory("llama_cpp");

    await fs.mkdir(runtimeRoot, {
      recursive: true,
    });

    const stagingDirectory = path.join(
      runtimeRoot,
      `.${runtimePackage.version}.installing-${process.pid}-${Date.now()}`,
    );

    await fs.mkdir(stagingDirectory, {
      recursive: true,
    });

    /*
     * IMPORTANT:
     *
     * RuntimeDownloader writes the completed file exactly to destinationPath.
     *
     * The previous implementation used:
     *
     *   llama-....zip.download
     *
     * and then passed that file to PowerShell Expand-Archive.
     *
     * Windows Expand-Archive requires a .zip extension.
     *
     * Therefore the actual archive must retain the .zip extension.
     */

    const archivePath = path.join(
      this.paths.getCacheDirectory(),
      runtimePackage.packageName,
    );

    try {
      throwIfAborted(options.signal);

      /*
       * ----------------------------------------------------------------------
       * Download
       * ----------------------------------------------------------------------
       */

      const downloadResult = await this.downloader.download(
        runtimePackage,
        archivePath,
        {
          signal: options.signal,

          onProgress: options.onDownloadProgress,
        },
      );

      throwIfAborted(options.signal);

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

      throwIfAborted(options.signal);

      /*
       * ----------------------------------------------------------------------
       * Find executable
       * ----------------------------------------------------------------------
       *
       * The archive may contain:
       *
       *   llama-server.exe
       *
       * OR:
       *
       *   llama-b10946-bin-win-cpu-x64/
       *       llama-server.exe
       *
       * findExecutable() handles both.
       */

      const stagedExecutable = await this.findExecutable(
        stagingDirectory,
        runtimePackage.executableRelativePath,
      );

      /*
       * ----------------------------------------------------------------------
       * Determine the actual executable path inside the extracted runtime
       * ----------------------------------------------------------------------
       */

      const stagedRelativeExecutablePath = path.relative(
        stagingDirectory,
        stagedExecutable,
      );

      if (
        !stagedRelativeExecutablePath ||
        path.isAbsolute(stagedRelativeExecutablePath) ||
        stagedRelativeExecutablePath.split(path.sep).includes("..")
      ) {
        throw new Error(
          "The discovered llama-server executable resolved outside the runtime staging directory.",
        );
      }

      const installedExecutableRelativePath = normalizeRelativePath(
        stagedRelativeExecutablePath,
      );

      /*
       * ----------------------------------------------------------------------
       * Validate executable
       * ----------------------------------------------------------------------
       */

      await this.assertExecutable(stagedExecutable);

      /*
       * ----------------------------------------------------------------------
       * Promote staging directory into final runtime directory
       * ----------------------------------------------------------------------
       */

      await fs.rename(stagingDirectory, runtimeDirectory);

      /*
       * ----------------------------------------------------------------------
       * Final executable path
       * ----------------------------------------------------------------------
       */

      const finalExecutable = path.join(
        runtimeDirectory,
        stagedRelativeExecutablePath,
      );

      await this.assertExecutable(finalExecutable);

      /*
       * ----------------------------------------------------------------------
       * Create runtime manifest
       * ----------------------------------------------------------------------
       */

      const manifest: RuntimeManifest = {
        schemaVersion: 1,

        runtime: runtimePackage.runtime,

        version: runtimePackage.version,

        platform: runtimePackage.platform,

        architecture: runtimePackage.architecture,

        variant: runtimePackage.variant,

        packageName: runtimePackage.packageName,

        packageUrl: runtimePackage.downloadUrl,

        packageSha256: downloadResult.sha256,

        /*
         * Store the ACTUAL path discovered in the archive.
         *
         * This makes future runtime resolution work even when the
         * llama.cpp archive contains a top-level directory.
         */
        executableRelativePath: installedExecutableRelativePath,

        installedAt: new Date().toISOString(),
      };

      await writeRuntimeManifest(manifestPath, manifest);

      /*
       * ----------------------------------------------------------------------
       * Verify written manifest
       * ----------------------------------------------------------------------
       */

      const verifiedManifest = await readRuntimeManifest({
        manifestPath,
      });

      if (!verifiedManifest) {
        throw new Error(
          "Runtime manifest could not be read after installation.",
        );
      }

      if (verifiedManifest.packageSha256 !== runtimePackage.sha256) {
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

      const manifestExecutablePath = path.join(
        runtimeDirectory,
        verifiedManifest.executableRelativePath,
      );

      await this.assertExecutable(manifestExecutablePath);

      /*
       * ----------------------------------------------------------------------
       * Remove downloaded archive
       * ----------------------------------------------------------------------
       *
       * The archive is only a temporary/cache artifact.
       *
       * The actual installed runtime remains under:
       *
       * AppData\Local\Veyra\runtimes\llama_cpp\<version>
       */

      await fs.rm(archivePath, {
        force: true,
      });

      return Object.freeze({
        runtime: runtimePackage.runtime,

        version: runtimePackage.version,

        executablePath: manifestExecutablePath,

        runtimeDirectory,

        manifestPath,

        packageName: runtimePackage.packageName,

        packageSha256: verifiedManifest.packageSha256,

        downloaded: true,

        bytesDownloaded: downloadResult.bytesDownloaded,

        releaseUrl: runtimePackage.releaseUrl,
      });
    } catch (error) {
      /*
       * ----------------------------------------------------------------------
       * Installation rollback
       * ----------------------------------------------------------------------
       */

      await fs.rm(stagingDirectory, {
        recursive: true,
        force: true,
      });

      await fs.rm(archivePath, {
        force: true,
      });

      await fs.rm(runtimeDirectory, {
        recursive: true,
        force: true,
      });

      throw new Error(
        `Failed to install llama.cpp runtime: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          cause: error,
        },
      );
    }
  }

  private async tryUseExistingRuntime(
    runtimePackage: RuntimePackage,
    runtimeDirectory: string,
    manifestPath: string,
    expectedExecutablePath: string,
  ): Promise<RuntimeInstallResult | null> {
    const manifest = await readRuntimeManifest({
      manifestPath,
    });

    if (!manifest) {
      return null;
    }

    /*
     * Validate runtime identity.
     */

    if (manifest.runtime !== runtimePackage.runtime) {
      return null;
    }

    if (manifest.version !== runtimePackage.version) {
      return null;
    }

    if (manifest.platform !== runtimePackage.platform) {
      return null;
    }

    if (manifest.architecture !== runtimePackage.architecture) {
      return null;
    }

    if (manifest.variant !== runtimePackage.variant) {
      return null;
    }

    /*
     * The installed archive must match the package currently selected
     * by RuntimePackageRegistry.
     */

    if (manifest.packageSha256 !== runtimePackage.sha256) {
      return null;
    }

    /*
     * Prefer the executable path recorded by the manifest.
     *
     * This is important when the archive had a top-level directory.
     */

    const manifestExecutablePath = path.join(
      runtimeDirectory,
      manifest.executableRelativePath,
    );

    try {
      await this.assertExecutable(manifestExecutablePath);
    } catch {
      /*
       * Backwards-compatible fallback for a manifest created by the
       * previous implementation.
       */

      try {
        await this.assertExecutable(expectedExecutablePath);
      } catch {
        return null;
      }
    }

    const executablePath = await this.resolveManifestExecutable(
      runtimeDirectory,
      manifest,
      expectedExecutablePath,
    );

    return Object.freeze({
      runtime: "llama_cpp",

      version: manifest.version,

      executablePath,

      runtimeDirectory,

      manifestPath,

      packageName: manifest.packageName,

      packageSha256: manifest.packageSha256,

      downloaded: false,

      bytesDownloaded: 0,

      releaseUrl: manifest.packageUrl,
    });
  }

  private async resolveManifestExecutable(
    runtimeDirectory: string,
    manifest: RuntimeManifest,
    fallbackPath: string,
  ): Promise<string> {
    const manifestPath = path.join(
      runtimeDirectory,
      manifest.executableRelativePath,
    );

    try {
      await this.assertExecutable(manifestPath);

      return manifestPath;
    } catch {
      await this.assertExecutable(fallbackPath);

      return fallbackPath;
    }
  }

  private async extractArchive(
    archivePath: string,
    destinationDirectory: string,
    signal?: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);

    if (process.platform !== "win32") {
      throw new Error(
        "Automatic runtime archive extraction is currently implemented for Windows.",
      );
    }

    /*
     * Validate that the downloaded file actually looks like a ZIP.
     *
     * RuntimePackageRegistry currently selects .zip assets, and the
     * downloader verifies the SHA-256 before this method is called.
     */

    if (!archivePath.toLowerCase().endsWith(".zip")) {
      throw new Error(
        `Runtime archive must have a .zip extension before extraction. Received: ${archivePath}`,
      );
    }

    /*
     * Windows ships PowerShell with Expand-Archive.
     *
     * Keeping the archive as .zip is important because Expand-Archive
     * validates the file extension before extraction.
     */

    const powershell = process.env.ComSpec ? "powershell.exe" : "powershell";

    const script = [
      "$ErrorActionPreference = 'Stop';",

      `Expand-Archive -LiteralPath ${this.quotePowerShell(archivePath)} ` +
        `-DestinationPath ${this.quotePowerShell(destinationDirectory)} ` +
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
        windowsHide: true,

        maxBuffer: 10 * 1024 * 1024,

        signal,
      },
    );
  }

  private async findExecutable(
    stagingDirectory: string,
    relativePath: string,
  ): Promise<string> {
    const directPath = path.join(stagingDirectory, relativePath);

    try {
      await this.assertExecutable(directPath);

      return directPath;
    } catch {
      /*
       * Some release archives contain a top-level directory, for example:
       *
       * llama-b10946-bin-win-cpu-x64/
       *   llama-server.exe
       *
       * Search the extracted tree before failing.
       */
    }

    const executableName = path.basename(relativePath);

    const matches: string[] = [];

    await this.walkForFilename(stagingDirectory, executableName, matches);

    if (matches.length === 0) {
      throw new Error(
        `Runtime executable "${executableName}" was not found in the downloaded archive.`,
      );
    }

    if (matches.length > 1) {
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
    const entries = await fs.readdir(directory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await this.walkForFilename(fullPath, filename, matches);

        continue;
      }

      if (
        entry.isFile() &&
        entry.name.toLowerCase() === filename.toLowerCase()
      ) {
        matches.push(fullPath);
      }
    }
  }

  private async assertExecutable(executablePath: string): Promise<void> {
    const stat = await fs.stat(executablePath);

    if (!stat.isFile()) {
      throw new Error(
        `Runtime executable is not a regular file: ${executablePath}`,
      );
    }

    await fs.access(executablePath);
  }

  private quotePowerShell(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}