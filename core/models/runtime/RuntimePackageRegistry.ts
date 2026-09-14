
// core/models/runtime/RuntimePackageRegistry.ts

import process from "node:process";

/**
 * Runtime identifiers used internally by Veyra.
 *
 * These MUST match the runtime identifiers used by:
 * - ModelRegistry
 * - RuntimeRegistry
 * - RuntimeManifest
 * - RuntimeInstaller
 */
export type ManagedRuntimeKind = "llama_cpp" | "whisper_cpp";

/**
 * Runtime acceleration variants currently supported by the
 * managed runtime installer.
 */
export type RuntimeVariant = "cpu" | "cuda";

/**
 * A verified upstream runtime package.
 *
 * This describes the archive itself, not the installed runtime.
 */
export interface RuntimePackage {
  /**
   * Internal Veyra runtime identifier.
   */
  readonly runtime: ManagedRuntimeKind;

  /**
   * Upstream release/tag identifier.
   *
   * Examples:
   * - llama.cpp: b10947
   * - whisper.cpp: v1.9.4
   * - whisper.cpp nightly: b5130
   */
  readonly version: string;

  /**
   * Node platform identifier.
   */
  readonly platform: NodeJS.Platform;

  /**
   * CPU architecture.
   */
  readonly architecture: string;

  /**
   * Runtime acceleration variant.
   */
  readonly variant: RuntimeVariant;

  /**
   * Exact upstream archive filename.
   */
  readonly packageName: string;

  /**
   * Direct upstream download URL.
   */
  readonly downloadUrl: string;

  /**
   * Verified SHA-256 digest of the archive.
   */
  readonly sha256: string;

  /**
   * Primary executable path inside the extracted archive.
   *
   * This is intentionally archive-relative and uses "/"
   * regardless of Windows path separators.
   */
  readonly executableRelativePath: string;

  /**
   * Optional executable hints.
   *
   * These are NOT installation requirements.
   */
  readonly auxiliaryExecutableRelativePaths?: readonly string[];

  /**
   * Official upstream release page.
   */
  readonly releaseUrl: string;
}

interface GitHubReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
  readonly size: number;
  readonly digest?: string | null;
}

interface GitHubRelease {
  readonly tag_name: string;
  readonly html_url: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
  readonly assets: readonly GitHubReleaseAsset[];
}

const LLAMA_GITHUB_RELEASES_API =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases";

const WHISPER_GITHUB_RELEASES_API =
  "https://api.github.com/repos/ggml-org/whisper.cpp/releases";

const USER_AGENT = "Veyra-Local-Model-Runtime/1.0";

/**
 * Current llama.cpp Windows CPU x64 archive naming.
 *
 * Example:
 *
 * llama-b10947-bin-win-cpu-x64.zip
 */
const WINDOWS_LLAMA_CPU_X64_PATTERN =
  /^llama-(.+)-bin-win-cpu-x64\.zip$/i;

/**
 * Current official whisper.cpp Windows x64 CPU archive.
 *
 * Current releases use:
 *
 * whisper-bin-x64.zip
 *
 * We also accept the explicit CPU form for forward compatibility.
 */
const WINDOWS_WHISPER_CPU_X64_PATTERNS: readonly RegExp[] = [
  /^whisper-bin-x64\.zip$/i,
  /^whisper-bin-win-cpu-x64\.zip$/i,
];

/**
 * Additional versioned naming variants that have appeared in
 * whisper.cpp distributions.
 *
 * These are intentionally secondary to the canonical
 * whisper-bin-x64.zip package.
 */
const WINDOWS_WHISPER_VERSIONED_CPU_X64_PATTERN =
  /^whisper(?:-cpp)?-(?:v)?[\w.-]+-win(?:32)?-x64-cpu\.zip$/i;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

function normalizeSha256(
  digest: string | null | undefined,
): string | null {
  if (!digest) {
    return null;
  }

  const value = digest.trim();

  const normalized = value
    .replace(/^sha256:/i, "")
    .trim()
    .toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function getArchitecture(): string {
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
 * Validate the currently implemented managed-runtime target.
 *
 * Veyra currently installs the CPU Windows x64 packages for these
 * managed runtimes.
 */
function assertWindowsX64(runtime: ManagedRuntimeKind): void {
  if (process.platform !== "win32") {
    throw new Error(
      `Automatic ${runtime} runtime installation is currently implemented ` +
        `for Windows. Detected platform: ${process.platform}.`,
    );
  }

  if (process.arch !== "x64") {
    throw new Error(
      `Automatic ${runtime} Windows runtime installation currently supports ` +
        `x64. Detected architecture: ${process.arch}.`,
    );
  }
}

function isUsableRelease(
  release: GitHubRelease,
  includePrereleases: boolean,
): boolean {
  if (release.draft) {
    return false;
  }

  if (!includePrereleases && release.prerelease) {
    return false;
  }

  return true;
}

function isWhisperCpuX64Asset(assetName: string): boolean {
  return (
    WINDOWS_WHISPER_CPU_X64_PATTERNS.some((pattern) =>
      pattern.test(assetName),
    ) ||
    WINDOWS_WHISPER_VERSIONED_CPU_X64_PATTERN.test(assetName)
  );
}

/**
 * Prefer the canonical official whisper.cpp package.
 *
 * Current preferred order:
 *
 * 1. whisper-bin-x64.zip
 * 2. explicit CPU packages
 * 3. other compatible versioned CPU packages
 */
function sortWhisperAssetsByPreference(
  assets: readonly GitHubReleaseAsset[],
): readonly GitHubReleaseAsset[] {
  return [...assets].sort((a, b) => {
    const aCanonical = /^whisper-bin-x64\.zip$/i.test(a.name);
    const bCanonical = /^whisper-bin-x64\.zip$/i.test(b.name);

    if (aCanonical && !bCanonical) {
      return -1;
    }

    if (!aCanonical && bCanonical) {
      return 1;
    }

    const aCpu = /cpu/i.test(a.name);
    const bCpu = /cpu/i.test(b.name);

    if (aCpu && !bCpu) {
      return -1;
    }

    if (!aCpu && bCpu) {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });
}

export class RuntimePackageRegistry {
  /**
   * Resolve the latest verified llama.cpp package supported by
   * the current machine.
   */
  public async resolveLlamaCpp(
    options: {
      readonly signal?: AbortSignal;
      readonly includePrereleases?: boolean;
    } = {},
  ): Promise<RuntimePackage> {
    throwIfAborted(options.signal);

    /**
     * IMPORTANT:
     *
     * Pass the internal runtime ID here, not "llama.cpp".
     */
    assertWindowsX64("llama_cpp");

    const releases = await this.fetchReleases(
      LLAMA_GITHUB_RELEASES_API,
      "llama.cpp",
      options.signal,
    );

    const allowPrereleases = options.includePrereleases ?? true;

    for (const release of releases) {
      throwIfAborted(options.signal);

      if (!isUsableRelease(release, allowPrereleases)) {
        continue;
      }

      const asset = release.assets.find((candidate) =>
        WINDOWS_LLAMA_CPU_X64_PATTERN.test(candidate.name),
      );

      if (!asset) {
        continue;
      }

      const sha256 = normalizeSha256(asset.digest);

      /**
       * Never install an unverified runtime.
       */
      if (!sha256) {
        continue;
      }

      return Object.freeze({
        runtime: "llama_cpp",

        version: release.tag_name,

        platform: "win32",

        architecture: getArchitecture(),

        variant: "cpu",

        packageName: asset.name,

        downloadUrl: asset.browser_download_url,

        sha256,

        executableRelativePath: "llama-server.exe",

        releaseUrl: release.html_url,
      });
    }

    throw new Error(
      "No verified official llama.cpp Windows x64 CPU runtime package was found.",
    );
  }

  /**
   * Resolve the latest verified whisper.cpp package supported by
   * the current machine.
   *
   * The current official Windows CPU package is:
   *
   * whisper-bin-x64.zip
   *
   * Its primary CLI executable is:
   *
   * Release/whisper-cli.exe
   */
  public async resolveWhisperCpp(
    options: {
      readonly signal?: AbortSignal;
      readonly includePrereleases?: boolean;
    } = {},
  ): Promise<RuntimePackage> {
    throwIfAborted(options.signal);

    assertWindowsX64("whisper_cpp");

    const releases = await this.fetchReleases(
      WHISPER_GITHUB_RELEASES_API,
      "whisper.cpp",
      options.signal,
    );

    const allowPrereleases = options.includePrereleases ?? true;

    for (const release of releases) {
      throwIfAborted(options.signal);

      if (!isUsableRelease(release, allowPrereleases)) {
        continue;
      }

      const candidates = sortWhisperAssetsByPreference(
        release.assets.filter((asset) =>
          isWhisperCpuX64Asset(asset.name),
        ),
      );

      for (const asset of candidates) {
        throwIfAborted(options.signal);

        const sha256 = normalizeSha256(asset.digest);

        /**
         * Never install a runtime without a verified SHA-256.
         */
        if (!sha256) {
          continue;
        }

        return Object.freeze({
          runtime: "whisper_cpp",

          version: release.tag_name,

          platform: "win32",

          architecture: getArchitecture(),

          variant: "cpu",

          packageName: asset.name,

          downloadUrl: asset.browser_download_url,

          sha256,

          /**
           * Current official whisper.cpp Windows archives place
           * the executable inside Release/.
           */
          executableRelativePath: "Release/whisper-cli.exe",

          /**
           * These are optional discovery hints.
           *
           * Installation MUST NOT fail merely because one of
           * these does not exist.
           */
          auxiliaryExecutableRelativePaths: Object.freeze([
            "Release/whisper-stream.exe",
            "Release/whisper-server.exe",
            "whisper-cli.exe",
            "whisper-stream.exe",
            "whisper-server.exe",
          ]),

          releaseUrl: release.html_url,
        });
      }
    }

    throw new Error(
      "No verified official whisper.cpp Windows x64 CPU runtime package was found.",
    );
  }

  /**
   * Generic managed-runtime resolver.
   */
  public async resolve(
    runtime: ManagedRuntimeKind,
    options: {
      readonly signal?: AbortSignal;
      readonly includePrereleases?: boolean;
    } = {},
  ): Promise<RuntimePackage> {
    switch (runtime) {
      case "llama_cpp":
        return this.resolveLlamaCpp(options);

      case "whisper_cpp":
        return this.resolveWhisperCpp(options);

      default: {
        const exhaustiveCheck: never = runtime;

        throw new Error(
          `Unsupported managed runtime "${String(exhaustiveCheck)}".`,
        );
      }
    }
  }

  /**
   * Fetch GitHub releases.
   */
  private async fetchReleases(
    apiUrl: string,
    runtimeName: string,
    signal?: AbortSignal,
  ): Promise<readonly GitHubRelease[]> {
    throwIfAborted(signal);

    let response: Response;

    try {
      response = await fetch(`${apiUrl}?per_page=30`, {
        method: "GET",

        headers: {
          Accept: "application/vnd.github+json",

          "User-Agent": USER_AGENT,

          "X-GitHub-Api-Version": "2022-11-28",
        },

        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new DOMException(
          "Operation was aborted.",
          "AbortError",
        );
      }

      throw new Error(
        `GitHub ${runtimeName} release lookup failed.`,
        {
          cause: error,
        },
      );
    }

    throwIfAborted(signal);

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      throw new Error(
        `GitHub ${runtimeName} release lookup failed with HTTP ` +
          `${response.status}.` +
          (body ? ` ${body.slice(0, 500)}` : ""),
      );
    }

    const payload: unknown = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error(
        `GitHub returned an invalid ${runtimeName} release response.`,
      );
    }

    const releases: GitHubRelease[] = [];

    for (const release of payload) {
      if (!release || typeof release !== "object") {
        continue;
      }

      const record = release as Record<string, unknown>;

      if (
        typeof record.tag_name !== "string" ||
        typeof record.html_url !== "string" ||
        typeof record.prerelease !== "boolean" ||
        typeof record.draft !== "boolean" ||
        !Array.isArray(record.assets)
      ) {
        continue;
      }

      const assets: GitHubReleaseAsset[] = [];

      for (const asset of record.assets) {
        if (!asset || typeof asset !== "object") {
          continue;
        }

        const assetRecord = asset as Record<string, unknown>;

        if (
          typeof assetRecord.name !== "string" ||
          typeof assetRecord.browser_download_url !== "string" ||
          typeof assetRecord.size !== "number"
        ) {
          continue;
        }

        const digest =
          assetRecord.digest === null ||
          assetRecord.digest === undefined
            ? undefined
            : typeof assetRecord.digest === "string"
              ? assetRecord.digest
              : undefined;

        assets.push({
          name: assetRecord.name,

          browser_download_url:
            assetRecord.browser_download_url,

          size: assetRecord.size,

          digest,
        });
      }

      releases.push({
        tag_name: record.tag_name,

        html_url: record.html_url,

        prerelease: record.prerelease,

        draft: record.draft,

        assets: Object.freeze(assets),
      });
    }

    return Object.freeze(releases);
  }
}
