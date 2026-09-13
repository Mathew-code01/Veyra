// core/models/runtime/RuntimeDownloader.ts

import { createHash } from "node:crypto";



import { promises as fs } from "node:fs";

import { open } from "node:fs/promises";

import path from "node:path";

import { RuntimePackage } from "./RuntimePackageRegistry";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

export interface RuntimeDownloadResult {
  readonly filePath: string;

  readonly bytesDownloaded: number;

  readonly sha256: string;
}

export class RuntimeDownloader {
  public async download(
    runtimePackage: RuntimePackage,
    destinationPath: string,
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (
        downloadedBytes: number,
        totalBytes?: number,
      ) => void;
    } = {},
  ): Promise<RuntimeDownloadResult> {
    throwIfAborted(options.signal);

    const normalizedPath = path.resolve(destinationPath.trim());

    if (!normalizedPath) {
      throw new Error("Runtime download destination cannot be empty.");
    }

    await fs.mkdir(path.dirname(normalizedPath), {
      recursive: true,
    });

    const partialPath = `${normalizedPath}.part`;

    await fs.rm(partialPath, {
      force: true,
    });

    const response = await fetch(runtimePackage.downloadUrl, {
      method: "GET",

      headers: {
        Accept: "application/octet-stream",

        "User-Agent": "Veyra-Local-Model-Runtime/1.0",
      },

      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Runtime download failed with HTTP ${response.status}.`);
    }

    if (!response.body) {
      throw new Error("Runtime download returned an empty response body.");
    }

    const totalBytes = this.parseContentLength(
      response.headers.get("content-length"),
    );

    const file = await open(partialPath, "w");

    const hash = createHash("sha256");

    let downloadedBytes = 0;

    try {
      const reader = response.body.getReader();

      try {
        while (true) {
          throwIfAborted(options.signal);

          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = Buffer.from(value);

          hash.update(chunk);

          await file.write(chunk);

          downloadedBytes += chunk.byteLength;

          options.onProgress?.(downloadedBytes, totalBytes);
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      await file.close();

      await fs.rm(partialPath, {
        force: true,
      });

      throw error;
    }

    await file.close();

    const actualSha256 = hash.digest("hex").toLowerCase();

    const expectedSha256 = runtimePackage.sha256.trim().toLowerCase();

    if (actualSha256 !== expectedSha256) {
      await fs.rm(partialPath, {
        force: true,
      });

      throw new Error(
        `Runtime SHA-256 verification failed.\n` +
          `Expected: ${expectedSha256}\n` +
          `Actual:   ${actualSha256}`,
      );
    }

    await fs.rename(partialPath, normalizedPath);

    return Object.freeze({
      filePath: normalizedPath,

      bytesDownloaded: downloadedBytes,

      sha256: actualSha256,
    });
  }

  private parseContentLength(value: string | null): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);

    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
}

