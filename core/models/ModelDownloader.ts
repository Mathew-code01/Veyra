// Relative path: core/models/ModelDownloader.ts

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import type { ModelDefinition } from "./ModelRegistry";

export interface ModelDownloadProgress {
  readonly modelId: string;
  readonly downloadedBytes: number;
  readonly totalBytes: number | null;
  readonly percent: number | null;
  readonly bytesPerSecond: number;
  readonly elapsedMs: number;
}

export interface ModelDownloadOptions {
  readonly destinationDirectory: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ModelDownloadProgress) => void;
  readonly overwrite?: boolean;
}

export interface ModelDownloadResult {
  readonly modelId: string;
  readonly filePath: string;
  readonly bytesDownloaded: number;
  readonly sha256: string;
  readonly elapsedMs: number;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Model download was aborted.", "AbortError");
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class ModelDownloader {
  public async download(
    model: ModelDefinition,
    options: ModelDownloadOptions,
  ): Promise<ModelDownloadResult> {
    if (!model.artifact?.url) {
      throw new Error(
        `Model "${model.id}" does not have a downloadable artifact configured.`,
      );
    }

    throwIfAborted(options.signal);

    await fs.mkdir(options.destinationDirectory, {
      recursive: true,
    });

    const filename = sanitizeFilename(model.artifact.filename);

    const destinationPath = path.join(options.destinationDirectory, filename);

    const temporaryPath = `${destinationPath}.part`;

    if (existsSync(destinationPath) && options.overwrite !== true) {
      throw new Error(`Model file already exists: ${destinationPath}`);
    }

    await fs.rm(temporaryPath, {
      force: true,
    });

    const startedAt = Date.now();

    let downloadedBytes = 0;

    const response = await fetch(model.artifact.url, {
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`Model download failed with HTTP ${response.status}.`);
    }

    if (!response.body) {
      throw new Error("Model download response did not contain a body.");
    }

    const contentLengthHeader = response.headers.get("content-length");

    const totalBytes =
      contentLengthHeader && Number.isFinite(Number(contentLengthHeader))
        ? Number(contentLengthHeader)
        : (model.artifact.sizeBytes ?? null);

    const hash = createHash("sha256");

    const transform = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        throwIfAborted(options.signal);

        downloadedBytes += chunk.byteLength;

        hash.update(chunk);

        const elapsedMs = Math.max(Date.now() - startedAt, 1);

        const bytesPerSecond = (downloadedBytes / elapsedMs) * 1000;

        const percent =
          totalBytes && totalBytes > 0
            ? Math.min(100, (downloadedBytes / totalBytes) * 100)
            : null;

        options.onProgress?.(
          Object.freeze({
            modelId: model.id,
            downloadedBytes,
            totalBytes,
            percent,
            bytesPerSecond,
            elapsedMs,
          }),
        );

        controller.enqueue(chunk);
      },
    });

    try {
      const transformedStream = response.body.pipeThrough(transform);

      await pipeline(transformedStream, createWriteStream(temporaryPath));

      throwIfAborted(options.signal);

      const sha256 = hash.digest("hex");

      if (
        model.artifact.sha256 &&
        sha256.toLowerCase() !== model.artifact.sha256.toLowerCase()
      ) {
        await fs.rm(temporaryPath, {
          force: true,
        });

        throw new Error(`SHA-256 verification failed for model "${model.id}".`);
      }

      if (options.overwrite === true) {
        await fs.rm(destinationPath, {
          force: true,
        });
      }

      await fs.rename(temporaryPath, destinationPath);

      return Object.freeze({
        modelId: model.id,
        filePath: destinationPath,
        bytesDownloaded: downloadedBytes,
        sha256,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      await fs.rm(temporaryPath, {
        force: true,
      });

      throw error;
    }
  }

  public async verifyChecksum(
    filePath: string,
    expectedSha256: string,
  ): Promise<boolean> {
    const hash = createHash("sha256");

    const stream = (await import("node:fs")).createReadStream(filePath);

    for await (const chunk of stream) {
      hash.update(chunk);
    }

    return hash.digest("hex").toLowerCase() === expectedSha256.toLowerCase();
  }

  public async remove(filePath: string): Promise<void> {
    await fs.rm(filePath, {
      force: true,
    });
  }

  public async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
