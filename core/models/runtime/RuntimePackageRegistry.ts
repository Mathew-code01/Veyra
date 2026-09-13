// core/models/runtime/RuntimePackageRegistry.ts

import process from "node:process";

export interface RuntimePackage {
  readonly runtime: "llama_cpp";

  readonly version: string;

  readonly platform: NodeJS.Platform;

  readonly architecture: string;

  readonly variant: "cpu";

  readonly packageName: string;

  readonly downloadUrl: string;

  readonly sha256: string;

  readonly executableRelativePath: string;

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

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/ggml-org/llama.cpp/releases";

const USER_AGENT = "Veyra-Local-Model-Runtime/1.0";

const WINDOWS_CPU_X64_PATTERN = /llama.*bin-win-cpu-x64\.zip$/i;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

function normalizeSha256(digest: string | null | undefined): string | null {
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

    default:
      return process.arch;
  }
}

export class RuntimePackageRegistry {
  public async resolveLlamaCpp(
    options: {
      readonly signal?: AbortSignal;
      readonly includePrereleases?: boolean;
    } = {},
  ): Promise<RuntimePackage> {
    throwIfAborted(options.signal);

    if (process.platform !== "win32") {
      throw new Error(
        `Automatic llama.cpp runtime installation is currently implemented for Windows. ` +
          `Detected platform: ${process.platform}.`,
      );
    }

    if (process.arch !== "x64") {
      throw new Error(
        `Automatic llama.cpp Windows runtime installation currently supports x64. ` +
          `Detected architecture: ${process.arch}.`,
      );
    }

    const releases = await this.fetchReleases(options.signal);

    const allowPrereleases = options.includePrereleases ?? true;

    for (const release of releases) {
      throwIfAborted(options.signal);

      if (release.draft) {
        continue;
      }

      if (!allowPrereleases && release.prerelease) {
        continue;
      }

      const asset = release.assets.find((candidate) =>
        WINDOWS_CPU_X64_PATTERN.test(candidate.name),
      );

      if (!asset) {
        continue;
      }

      const sha256 = normalizeSha256(asset.digest);

      if (!sha256) {
        /*
         * Never install an unverified runtime package.
         *
         * The official GitHub API normally exposes
         * the SHA-256 digest for release assets.
         */
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

        /*
         * llama.cpp release archives place
         * llama-server.exe in the archive root
         * for the Windows binary distributions.
         */
        executableRelativePath: "llama-server.exe",

        releaseUrl: release.html_url,
      });
    }

    throw new Error(
      "No verified official llama.cpp Windows x64 CPU runtime package was found.",
    );
  }

  private async fetchReleases(
    signal?: AbortSignal,
  ): Promise<readonly GitHubRelease[]> {
    const response = await fetch(`${GITHUB_RELEASES_API}?per_page=30`, {
      method: "GET",

      headers: {
        Accept: "application/vnd.github+json",

        "User-Agent": USER_AGENT,

        "X-GitHub-Api-Version": "2022-11-28",
      },

      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");

      throw new Error(
        `GitHub llama.cpp release lookup failed with HTTP ${response.status}.` +
          (body ? ` ${body.slice(0, 500)}` : ""),
      );
    }

    const payload: unknown = await response.json();

    if (!Array.isArray(payload)) {
      throw new Error("GitHub returned an invalid llama.cpp release response.");
    }

    return payload.filter(
      (release): release is GitHubRelease =>
        Boolean(release && typeof release === "object") &&
        typeof (release as Record<string, unknown>).tag_name === "string" &&
        Array.isArray((release as Record<string, unknown>).assets),
    );
  }
}