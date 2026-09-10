// core/models/ModelDownloader.ts

import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { statfs } from "node:fs/promises";
import path from "node:path";

import type { ModelDefinition } from "./ModelRegistry";
import { ModelDownloadError } from "./ModelDownloadError";

export interface ModelDownloadProgress {
  readonly modelId: string;
  readonly filename: string;
  readonly bytesDownloaded: number;
  readonly totalBytes: number | null;
  readonly percentage: number | null;
  readonly speedBytesPerSecond: number;
  readonly resumed: boolean;
  readonly phase: "preparing" | "downloading" | "verifying" | "completed";
}

export interface ModelDownloadOptions {
  readonly destinationDirectory: string;
  readonly overwrite?: boolean;
  readonly signal?: AbortSignal;
  readonly keepPartialOnAbort?: boolean;
  readonly onProgress?: (progress: ModelDownloadProgress) => void;
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
  readonly requestTimeoutMs?: number;
  readonly diskCheckIntervalMs?: number;
  readonly diskSafetyBufferBytes?: number;
}

export interface ModelDownloadResult {
  readonly modelId: string;
  readonly filename: string;
  readonly filePath: string;
  readonly bytesDownloaded: number;
  readonly sha256: string;
  readonly resumed: boolean;
  readonly attempts: number;
}

type ModelDownloadAttemptResult = Omit<ModelDownloadResult, "attempts">;

interface RangeInformation {
  readonly start: number;
  readonly end: number;
  readonly total: number | null;
}

interface AttemptSignal {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly dispose: () => void;
}

interface DownloadAttemptContext {
  readonly finalPath: string;
  readonly partialPath: string;
  readonly partialBytes: number;
  readonly resumed: boolean;
  readonly expectedSha256: string;
  readonly requestTimeoutMs: number;
  readonly diskCheckIntervalMs: number;
  readonly diskSafetyBufferBytes: number;
}

const DEFAULT_MAX_RETRIES = 5;

const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;

const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

const DEFAULT_DISK_CHECK_INTERVAL_MS = 1_500;

const DEFAULT_DISK_SAFETY_BUFFER_BYTES = 1 * 1024 ** 3;

const PROGRESS_INTERVAL_MS = 250;

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function normalizeSha256(value: string): string {
  return value.trim().toLowerCase();
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (
      error as {
        code?: unknown;
      }
    ).code;

    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

function isDiskFullError(error: unknown): boolean {
  return getErrorCode(error) === "ENOSPC";
}

function isTransientFileSystemError(error: unknown): boolean {
  const code = getErrorCode(error);

  return code === "EBUSY" || code === "EAGAIN" || code === "EINTR";
}

function throwIfAborted(modelId: string, signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ModelDownloadError(`Download of "${modelId}" was aborted.`, {
      code: "ABORTED",
      modelId,
      retryable: false,
    });
  }
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Download was aborted.", "AbortError"));

      return;
    }

    let settled = false;

    const cleanup = (): void => {
      signal?.removeEventListener("abort", abortHandler);
    };

    const abortHandler = (): void => {
      if (settled) {
        return;
      }

      settled = true;

      clearTimeout(timer);

      cleanup();

      reject(new DOMException("Download was aborted.", "AbortError"));
    };

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      resolve();
    }, milliseconds);

    if (signal) {
      signal.addEventListener("abort", abortHandler, {
        once: true,
      });
    }
  });
}

async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.once("end", resolve);

    stream.once("error", reject);
  });

  return hash.digest("hex");
}

export class ModelDownloader {
  public async download(
    model: ModelDefinition,
    options: ModelDownloadOptions,
  ): Promise<ModelDownloadResult> {
    const artifact = model.artifact;

    if (!artifact) {
      throw new ModelDownloadError(
        `Model "${model.id}" does not define a downloadable artifact.`,
        {
          code: "INVALID_ARTIFACT",

          modelId: model.id,

          retryable: false,
        },
      );
    }

    const modelId = model.id;

    const filename = artifact.filename.trim();

    const url = artifact.url.trim();

    const expectedSha256 = normalizeSha256(artifact.sha256 ?? "");

    if (!url) {
      throw new ModelDownloadError(
        `Model "${modelId}" has an empty artifact URL.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    if (!filename) {
      throw new ModelDownloadError(
        `Model "${modelId}" has an empty artifact filename.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new ModelDownloadError(
        `Model "${modelId}" has an invalid SHA-256 checksum.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    const destinationDirectory = path.resolve(options.destinationDirectory);

    await fs.mkdir(destinationDirectory, {
      recursive: true,
    });

    const finalPath = path.join(destinationDirectory, filename);

    const partialPath = `${finalPath}.part`;

    this.assertSafeArtifactPath(destinationDirectory, finalPath, modelId);

    this.assertSafeArtifactPath(destinationDirectory, partialPath, modelId);

    const maxRetries = Math.max(
      0,
      Math.floor(options.maxRetries ?? DEFAULT_MAX_RETRIES),
    );

    const retryBaseDelayMs = Math.max(
      100,
      Math.floor(options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS),
    );

    const retryMaxDelayMs = Math.max(
      retryBaseDelayMs,
      Math.floor(options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS),
    );

    const requestTimeoutMs = Math.max(
      5_000,
      Math.floor(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
    );

    const diskCheckIntervalMs = Math.max(
      500,
      Math.floor(options.diskCheckIntervalMs ?? DEFAULT_DISK_CHECK_INTERVAL_MS),
    );

    const diskSafetyBufferBytes = Math.max(
      0,
      Math.floor(
        options.diskSafetyBufferBytes ?? DEFAULT_DISK_SAFETY_BUFFER_BYTES,
      ),
    );

    throwIfAborted(modelId, options.signal);

    options.onProgress?.(
      Object.freeze({
        modelId,

        filename,

        bytesDownloaded: 0,

        totalBytes: artifact.sizeBytes ?? null,

        percentage: artifact.sizeBytes ? 0 : null,

        speedBytesPerSecond: 0,

        resumed: false,

        phase: "preparing",
      }),
    );

    if (
      await this.isExistingValidArtifact(
        finalPath,
        expectedSha256,
        artifact.sizeBytes,
      )
    ) {
      const stat = await fs.stat(finalPath);

      return Object.freeze({
        modelId,

        filename,

        filePath: finalPath,

        bytesDownloaded: stat.size,

        sha256: expectedSha256,

        resumed: false,

        attempts: 0,
      });
    }

    if (options.overwrite) {
      await fs.rm(finalPath, {
        force: true,
      });

      await fs.rm(partialPath, {
        force: true,
      });
    }

    let attempts = 0;

    while (true) {
      throwIfAborted(modelId, options.signal);

      let partialBytes = await this.getFileSize(partialPath);

      if (
        artifact.sizeBytes !== undefined &&
        partialBytes > artifact.sizeBytes
      ) {
        await fs.rm(partialPath, {
          force: true,
        });

        partialBytes = 0;
      }

      const remainingBytes =
        artifact.sizeBytes !== undefined
          ? Math.max(0, artifact.sizeBytes - partialBytes)
          : 0;

      await this.assertEnoughDiskSpace(
        destinationDirectory,
        remainingBytes,
        diskSafetyBufferBytes,
        modelId,
      );

      const resumed = partialBytes > 0;

      attempts += 1;

      try {
        const result = await this.downloadAttempt(model, options, {
          finalPath,

          partialPath,

          partialBytes,

          resumed,

          expectedSha256,

          requestTimeoutMs,

          diskCheckIntervalMs,

          diskSafetyBufferBytes,
        });

        return Object.freeze({
          ...result,

          attempts,
        });
      } catch (error) {
        if (error instanceof ModelDownloadError && error.code === "ABORTED") {
          if (options.keepPartialOnAbort === false) {
            await fs.rm(partialPath, {
              force: true,
            });
          }

          throw error;
        }

        const retryable = this.isRetryableDownloadError(error);

        if (!retryable || attempts > maxRetries) {
          if (error instanceof ModelDownloadError) {
            throw error;
          }

          throw new ModelDownloadError(
            `Model "${modelId}" download failed after ${attempts} attempt${
              attempts === 1 ? "" : "s"
            }.`,
            {
              code: "NETWORK",

              modelId,

              retryable: false,

              cause: error,
            },
          );
        }

        const retryDelay = this.calculateRetryDelay(
          attempts,
          retryBaseDelayMs,
          retryMaxDelayMs,
        );

        await sleep(retryDelay, options.signal);
      }
    }
  }

  public async verifyChecksum(
    filePath: string,
    expectedSha256: string,
  ): Promise<boolean> {
    const actual = await calculateFileSha256(filePath);

    return actual === normalizeSha256(expectedSha256);
  }

  public async remove(filePath: string): Promise<void> {
    await fs.rm(filePath, {
      force: true,
    });
  }

  public async removePartial(partialFilePath: string): Promise<void> {
    await fs.rm(partialFilePath, {
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

  private async downloadAttempt(
    model: ModelDefinition,
    options: ModelDownloadOptions,
    context: DownloadAttemptContext,
  ): Promise<ModelDownloadAttemptResult> {
    const artifact = model.artifact;

    if (!artifact) {
      throw new ModelDownloadError(`Model "${model.id}" has no artifact.`, {
        code: "INVALID_ARTIFACT",

        modelId: model.id,

        retryable: false,
      });
    }

    const attemptSignal = this.createAttemptSignal(
      options.signal,
      context.requestTimeoutMs,
    );

    let response: Response;

    try {
      response = await fetch(
        artifact.url,
        context.partialBytes > 0
          ? {
              headers: {
                Range: `bytes=${context.partialBytes}-`,
              },

              signal: attemptSignal.signal,
            }
          : {
              signal: attemptSignal.signal,
            },
      );
    } catch (error) {
      const timedOut = attemptSignal.didTimeout();

      attemptSignal.dispose();

      if (options.signal?.aborted) {
        throw new ModelDownloadError(`Download of "${model.id}" was aborted.`, {
          code: "ABORTED",

          modelId: model.id,

          retryable: false,

          cause: error,
        });
      }

      throw new ModelDownloadError(
        timedOut
          ? `The download request for "${model.id}" timed out.`
          : `Network error while downloading "${model.id}".`,
        {
          code: timedOut ? "NETWORK_TIMEOUT" : "NETWORK",

          modelId: model.id,

          retryable: true,

          cause: error,
        },
      );
    }

    if (response.status === 416) {
      const serverTotal = this.parseRangeTotal(
        response.headers.get("content-range"),
      );

      attemptSignal.dispose();

      if (
        context.partialBytes > 0 &&
        serverTotal !== null &&
        context.partialBytes === serverTotal
      ) {
        return this.finalizePartialFile(model, options, context);
      }

      await fs.rm(context.partialPath, {
        force: true,
      });

      throw new ModelDownloadError(
        `The server rejected the resume range for "${model.id}". The partial file has been reset safely.`,
        {
          code: "RANGE_NOT_SATISFIABLE",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    if (this.isRetryableHttpStatus(response.status)) {
      const retryAfterMs = this.parseRetryAfterMs(
        response.headers.get("retry-after"),
      );

      attemptSignal.dispose();

      if (retryAfterMs !== null) {
        await sleep(
          Math.min(retryAfterMs, DEFAULT_RETRY_MAX_DELAY_MS),
          options.signal,
        );
      }

      throw new ModelDownloadError(
        `Server returned retryable HTTP status ${response.status} for "${model.id}".`,
        {
          code: "NETWORK",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    if (!response.ok) {
      const body = await this.safeReadResponseText(response);

      attemptSignal.dispose();

      throw new ModelDownloadError(
        `Model download failed with HTTP ${response.status}: ${
          body || response.statusText
        }`,
        {
          code: "HTTP_PERMANENT_FAILURE",

          modelId: model.id,

          retryable: false,
        },
      );
    }

    let actualPartialBytes = context.partialBytes;

    let resumed = context.resumed;

    let totalBytes: number | null = artifact.sizeBytes ?? null;

    const contentLength = this.parseContentLength(
      response.headers.get("content-length"),
    );

    if (context.partialBytes > 0) {
      if (response.status === 200) {
        /*
         * The server ignored Range.
         *
         * Never append a full response to an
         * existing partial file.
         */
        await fs.rm(context.partialPath, {
          force: true,
        });

        actualPartialBytes = 0;

        resumed = false;
      } else if (response.status === 206) {
        const range = this.parseContentRange(
          response.headers.get("content-range"),
        );

        if (!range || range.start !== context.partialBytes) {
          attemptSignal.dispose();

          throw new ModelDownloadError(
            `Server returned an invalid Content-Range while resuming "${model.id}".`,
            {
              code: "CONTENT_RANGE_MISMATCH",

              modelId: model.id,

              retryable: true,
            },
          );
        }

        if (range.total !== null) {
          totalBytes = range.total;
        }

        const expectedRemaining =
          totalBytes !== null
            ? Math.max(0, totalBytes - context.partialBytes)
            : null;

        if (
          expectedRemaining !== null &&
          contentLength !== null &&
          contentLength !== expectedRemaining
        ) {
          attemptSignal.dispose();

          throw new ModelDownloadError(
            `Server Content-Length does not match the requested Range for "${model.id}".`,
            {
              code: "CONTENT_LENGTH_MISMATCH",

              modelId: model.id,

              retryable: true,
            },
          );
        }
      }
    }

    if (actualPartialBytes === 0 && response.status === 200) {
      if (
        artifact.sizeBytes !== undefined &&
        contentLength !== null &&
        contentLength !== artifact.sizeBytes
      ) {
        attemptSignal.dispose();

        throw new ModelDownloadError(
          `Server Content-Length for "${model.id}" does not match the expected artifact size.`,
          {
            code: "CONTENT_LENGTH_MISMATCH",

            modelId: model.id,

            retryable: false,
          },
        );
      }

      if (contentLength !== null) {
        totalBytes = contentLength;
      }
    }

    await this.assertEnoughDiskSpace(
      options.destinationDirectory,
      totalBytes !== null ? Math.max(0, totalBytes - actualPartialBytes) : 0,
      context.diskSafetyBufferBytes,
      model.id,
    );

    const fileHandle = await fs.open(
      context.partialPath,
      actualPartialBytes > 0 && response.status === 206 ? "a" : "w",
    );

    try {
      await this.writeResponse(
        response,
        fileHandle,
        model,
        artifact.filename,
        actualPartialBytes,
        totalBytes,
        resumed,
        options,
        context.diskCheckIntervalMs,
        context.diskSafetyBufferBytes,
      );

      await fileHandle.sync();
    } catch (error) {
      if (error instanceof ModelDownloadError && error.code === "DISK_SPACE") {
        throw error;
      }

      if (isDiskFullError(error)) {
        throw new ModelDownloadError(
          `The disk became full while downloading "${model.id}". The partial download has been preserved.`,
          {
            code: "DISK_SPACE",

            modelId: model.id,

            retryable: false,

            cause: error,
          },
        );
      }

      if (options.signal?.aborted) {
        throw new ModelDownloadError(`Download of "${model.id}" was aborted.`, {
          code: "ABORTED",

          modelId: model.id,

          retryable: false,

          cause: error,
        });
      }

      throw new ModelDownloadError(
        `The connection was interrupted while downloading "${model.id}". The partial download has been preserved.`,
        {
          code: "NETWORK",

          modelId: model.id,

          retryable: true,

          cause: error,
        },
      );
    } finally {
      attemptSignal.dispose();

      await fileHandle.close();
    }

    const stat = await fs.stat(context.partialPath);

    const downloadedBytes = stat.size;

    if (totalBytes !== null && downloadedBytes !== totalBytes) {
      throw new ModelDownloadError(
        `Downloaded size mismatch for "${model.id}". Expected ${totalBytes} bytes but received ${downloadedBytes}.`,
        {
          code: "SIZE_MISMATCH",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    if (
      artifact.sizeBytes !== undefined &&
      downloadedBytes !== artifact.sizeBytes
    ) {
      throw new ModelDownloadError(
        `Final artifact size mismatch for "${model.id}". Expected ${artifact.sizeBytes} bytes but received ${downloadedBytes}.`,
        {
          code: "SIZE_MISMATCH",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    throwIfAborted(model.id, options.signal);

    options.onProgress?.(
      Object.freeze({
        modelId: model.id,

        filename: artifact.filename,

        bytesDownloaded: downloadedBytes,

        totalBytes,

        percentage: totalBytes !== null ? 100 : null,

        speedBytesPerSecond: 0,

        resumed,

        phase: "verifying",
      }),
    );

    const actualSha256 = await calculateFileSha256(context.partialPath);

    if (actualSha256 !== context.expectedSha256) {
      await fs.rm(context.partialPath, {
        force: true,
      });

      throw new ModelDownloadError(
        `SHA-256 verification failed for "${model.id}". Expected ${context.expectedSha256} but received ${actualSha256}.`,
        {
          code: "CHECKSUM_MISMATCH",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    await this.atomicCommit(context.partialPath, context.finalPath, model.id);

    options.onProgress?.(
      Object.freeze({
        modelId: model.id,

        filename: artifact.filename,

        bytesDownloaded: downloadedBytes,

        totalBytes,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed,

        phase: "completed",
      }),
    );

    return {
      modelId: model.id,

      filename: artifact.filename,

      filePath: context.finalPath,

      bytesDownloaded: downloadedBytes,

      sha256: actualSha256,

      resumed,
    };
  }

  private async finalizePartialFile(
    model: ModelDefinition,
    options: ModelDownloadOptions,
    context: DownloadAttemptContext,
  ): Promise<ModelDownloadAttemptResult> {
    const artifact = model.artifact;

    const stat = await fs.stat(context.partialPath);

    if (artifact?.sizeBytes !== undefined && stat.size !== artifact.sizeBytes) {
      await fs.rm(context.partialPath, {
        force: true,
      });

      throw new ModelDownloadError(
        `The completed partial artifact has an invalid size for "${model.id}".`,
        {
          code: "SIZE_MISMATCH",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    const actualSha256 = await calculateFileSha256(context.partialPath);

    if (actualSha256 !== context.expectedSha256) {
      await fs.rm(context.partialPath, {
        force: true,
      });

      throw new ModelDownloadError(
        `SHA-256 verification failed for "${model.id}".`,
        {
          code: "CHECKSUM_MISMATCH",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    await this.atomicCommit(context.partialPath, context.finalPath, model.id);

    options.onProgress?.(
      Object.freeze({
        modelId: model.id,

        filename: artifact?.filename ?? "model",

        bytesDownloaded: stat.size,

        totalBytes: stat.size,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed: true,

        phase: "completed",
      }),
    );

    return {
      modelId: model.id,

      filename: artifact?.filename ?? "model",

      filePath: context.finalPath,

      bytesDownloaded: stat.size,

      sha256: actualSha256,

      resumed: true,
    };
  }

  private async writeResponse(
    response: Response,
    fileHandle: Awaited<ReturnType<typeof fs.open>>,
    model: ModelDefinition,
    filename: string,
    initialBytes: number,
    totalBytes: number | null,
    resumed: boolean,
    options: ModelDownloadOptions,
    diskCheckIntervalMs: number,
    diskSafetyBufferBytes: number,
  ): Promise<void> {
    if (!response.body) {
      throw new ModelDownloadError(
        `Model "${model.id}" returned an empty response body.`,
        {
          code: "NETWORK",

          modelId: model.id,

          retryable: true,
        },
      );
    }

    const reader = response.body.getReader();

    let bytesDownloaded = initialBytes;

    const startedAt = Date.now();

    let lastProgressAt = startedAt;

    let lastDiskCheckAt = startedAt;

    try {
      while (true) {
        throwIfAborted(model.id, options.signal);

        const now = Date.now();

        if (now - lastDiskCheckAt >= diskCheckIntervalMs) {
          const remaining =
            totalBytes !== null ? Math.max(0, totalBytes - bytesDownloaded) : 0;

          await this.assertEnoughDiskSpace(
            options.destinationDirectory,
            remaining,
            diskSafetyBufferBytes,
            model.id,
          );

          lastDiskCheckAt = now;
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value && value.byteLength > 0) {
          try {
            await fileHandle.write(value);
          } catch (error) {
            if (isDiskFullError(error)) {
              throw new ModelDownloadError(
                `The disk became full while downloading "${model.id}". The partial download has been preserved.`,
                {
                  code: "DISK_SPACE",

                  modelId: model.id,

                  retryable: false,

                  cause: error,
                },
              );
            }

            throw error;
          }

          bytesDownloaded += value.byteLength;
        }

        const currentTime = Date.now();

        if (currentTime - lastProgressAt >= PROGRESS_INTERVAL_MS) {
          const elapsedSeconds = Math.max(
            0.001,
            (currentTime - startedAt) / 1_000,
          );

          const speed = Math.max(
            0,
            (bytesDownloaded - initialBytes) / elapsedSeconds,
          );

          const percentage =
            totalBytes !== null
              ? Math.min(100, Math.max(0, (bytesDownloaded / totalBytes) * 100))
              : null;

          options.onProgress?.(
            Object.freeze({
              modelId: model.id,

              filename,

              bytesDownloaded,

              totalBytes,

              percentage,

              speedBytesPerSecond: speed,

              resumed,

              phase: "downloading",
            }),
          );

          lastProgressAt = currentTime;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async atomicCommit(
    partialPath: string,
    finalPath: string,
    modelId: string,
  ): Promise<void> {
    try {
      /*
       * The partial file has already passed
       * size and SHA-256 checks.
       *
       * Removing an old invalid final file
       * first is safe because the verified
       * .part file remains available until
       * rename succeeds.
       */
      await fs.rm(finalPath, {
        force: true,
      });

      await fs.rename(partialPath, finalPath);
    } catch (error) {
      if (isTransientFileSystemError(error)) {
        throw new ModelDownloadError(
          `The filesystem temporarily blocked finalizing "${modelId}".`,
          {
            code: "FILE_SYSTEM",

            modelId,

            retryable: true,

            cause: error,
          },
        );
      }

      throw new ModelDownloadError(
        `Veyra could not finalize the downloaded model "${modelId}".`,
        {
          code: "FILE_SYSTEM",

          modelId,

          retryable: false,

          cause: error,
        },
      );
    }
  }

  private async isExistingValidArtifact(
    filePath: string,
    expectedSha256: string,
    expectedSizeBytes?: number,
  ): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) {
        return false;
      }

      if (expectedSizeBytes !== undefined && stat.size !== expectedSizeBytes) {
        return false;
      }

      return await this.verifyChecksum(filePath, expectedSha256);
    } catch {
      return false;
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stat = await fs.stat(filePath);

      return stat.isFile() ? stat.size : 0;
    } catch {
      return 0;
    }
  }

  private async assertEnoughDiskSpace(
    directory: string,
    remainingBytes: number,
    safetyBufferBytes: number,
    modelId: string,
  ): Promise<void> {
    if (remainingBytes <= 0) {
      return;
    }

    const stats = await statfs(directory);

    const freeBytes = Number(stats.bavail) * Number(stats.bsize);

    const requiredBytes = remainingBytes + safetyBufferBytes;

    if (freeBytes < requiredBytes) {
      throw new ModelDownloadError(
        `Insufficient disk space to continue downloading "${modelId}". ${freeBytes} bytes are available and ${requiredBytes} bytes are required including safety buffer.`,
        {
          code: "DISK_SPACE",

          modelId,

          retryable: false,
        },
      );
    }
  }

  private isRetryableDownloadError(error: unknown): boolean {
    if (error instanceof ModelDownloadError) {
      return error.retryable;
    }

    const code = getErrorCode(error);

    return (
      isTransientFileSystemError(error) ||
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "EPIPE"
    );
  }

  private isRetryableHttpStatus(status: number): boolean {
    return RETRYABLE_HTTP_STATUSES.has(status);
  }

  private calculateRetryDelay(
    attempt: number,
    base: number,
    maximum: number,
  ): number {
    const exponential = Math.min(maximum, base * 2 ** Math.max(0, attempt - 1));

    const jitter = Math.floor(Math.random() * Math.max(100, exponential * 0.2));

    return Math.min(maximum, exponential + jitter);
  }

  private parseContentLength(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private parseContentRange(value: string | null): RangeInformation | null {
    if (!value) {
      return null;
    }

    const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());

    if (!match) {
      return null;
    }

    const start = Number(match[1]);

    const end = Number(match[2]);

    const total = match[3] === "*" ? null : Number(match[3]);

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start
    ) {
      return null;
    }

    if (total !== null && (!Number.isSafeInteger(total) || total <= end)) {
      return null;
    }

    return {
      start,

      end,

      total,
    };
  }

  private parseRangeTotal(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const match = /^bytes\s+\*\/(\d+)$/i.exec(value.trim());

    if (!match) {
      return null;
    }

    const total = Number(match[1]);

    return Number.isSafeInteger(total) ? total : null;
  }

  private parseRetryAfterMs(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const trimmed = value.trim();

    const seconds = Number(trimmed);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.round(seconds * 1_000);
    }

    const date = Date.parse(trimmed);

    if (Number.isNaN(date)) {
      return null;
    }

    return Math.max(0, date - Date.now());
  }

  private async safeReadResponseText(response: Response): Promise<string> {
    try {
      return (await response.text()).slice(0, 4_096);
    } catch {
      return "";
    }
  }

  private createAttemptSignal(
    outerSignal: AbortSignal | undefined,
    timeoutMs: number,
  ): AttemptSignal {
    const controller = new AbortController();

    let timedOut = false;

    const outerAbortHandler = (): void => {
      controller.abort();
    };

    if (outerSignal) {
      if (outerSignal.aborted) {
        controller.abort();
      } else {
        outerSignal.addEventListener("abort", outerAbortHandler, {
          once: true,
        });
      }
    }

    const timer = setTimeout(() => {
      timedOut = true;

      controller.abort();
    }, timeoutMs);

    return {
      signal: controller.signal,

      didTimeout: () => timedOut,

      dispose: () => {
        clearTimeout(timer);

        outerSignal?.removeEventListener("abort", outerAbortHandler);
      },
    };
  }

  private assertSafeArtifactPath(
    destinationDirectory: string,
    artifactPath: string,
    modelId: string,
  ): void {
    const root = path.resolve(destinationDirectory);

    const resolved = path.resolve(artifactPath);

    if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
      throw new ModelDownloadError(
        `Artifact path for "${modelId}" escapes the model download directory.`,
        {
          code: "INVALID_ARTIFACT",

          modelId,

          retryable: false,
        },
      );
    }
  }
}
