// core/models/ModelDownloader.ts

import { createHash } from "node:crypto";

import { createReadStream, promises as fs } from "node:fs";

import { statfs } from "node:fs/promises";

import path from "node:path";

import type { ModelArtifact } from "./ModelRegistry";

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

  readonly artifactId?: string;

  readonly filename: string;

  readonly filePath: string;

  readonly bytesDownloaded: number;

  readonly sha256: string;

  readonly resumed: boolean;

  readonly attempts: number;
}

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
  readonly modelId: string;

  readonly artifact: ModelArtifact;

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
    const value = (
      error as {
        code?: unknown;
      }
    ).code;

    return typeof value === "string" ? value : undefined;
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
    let settled = false;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
      }

      signal?.removeEventListener("abort", abortHandler);
    };

    const abortHandler = (): void => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      reject(new DOMException("Operation was aborted.", "AbortError"));
    };

    if (signal?.aborted) {
      abortHandler();

      return;
    }

    if (signal) {
      signal.addEventListener("abort", abortHandler, {
        once: true,
      });
    }

    timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      cleanup();

      resolve();
    }, milliseconds);
  });
}

async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.once("end", () => resolve());

    stream.once("error", reject);
  });

  return hash.digest("hex");
}

export class ModelDownloader {
  /**
   * Backwards-compatible convenience API.
   *
   * New package-aware code should use
   * downloadArtifact() directly.
   */
  public async download(
    modelId: string,
    artifact: ModelArtifact,
    options: ModelDownloadOptions,
  ): Promise<ModelDownloadResult> {
    return this.downloadArtifact(modelId, artifact, options);
  }

  public async downloadArtifact(
    modelId: string,
    artifact: ModelArtifact,
    options: ModelDownloadOptions,
  ): Promise<ModelDownloadResult> {
    const normalizedModelId = modelId.trim();

    if (!normalizedModelId) {
      throw new ModelDownloadError("A model id is required.", {
        code: "INVALID_ARTIFACT",
        modelId,
        retryable: false,
      });
    }

    this.validateArtifact(normalizedModelId, artifact);

    const destinationDirectory = path.resolve(options.destinationDirectory);

    await fs.mkdir(destinationDirectory, {
      recursive: true,
    });

    const filename = artifact.filename.trim();

    const finalPath = path.join(destinationDirectory, filename);

    const partialPath = `${finalPath}.part`;

    this.assertSafeArtifactPath(
      destinationDirectory,
      finalPath,
      normalizedModelId,
    );

    this.assertSafeArtifactPath(
      destinationDirectory,
      partialPath,
      normalizedModelId,
    );

    const expectedSha256 = normalizeSha256(artifact.sha256);

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

    throwIfAborted(normalizedModelId, options.signal);

    options.onProgress?.(
      Object.freeze({
        modelId: normalizedModelId,

        filename,

        bytesDownloaded: 0,

        totalBytes: artifact.sizeBytes,

        percentage: 0,

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

      options.onProgress?.(
        Object.freeze({
          modelId: normalizedModelId,

          filename,

          bytesDownloaded: stat.size,

          totalBytes: artifact.sizeBytes,

          percentage: 100,

          speedBytesPerSecond: 0,

          resumed: false,

          phase: "completed",
        }),
      );

      return Object.freeze({
        modelId: normalizedModelId,

        artifactId: artifact.id,

        filename,

        filePath: finalPath,

        bytesDownloaded: stat.size,

        sha256: expectedSha256,

        resumed: false,

        attempts: 0,
      });
    }

    if (options.overwrite) {
      await fs.rm(finalPath, { force: true });

      await fs.rm(partialPath, { force: true });
    }

    let attempts = 0;

    while (true) {
      throwIfAborted(normalizedModelId, options.signal);

      let partialBytes = await this.getFileSize(partialPath);

      if (
        artifact.sizeBytes !== undefined &&
        partialBytes > artifact.sizeBytes
      ) {
        await fs.rm(partialPath, { force: true });

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
        normalizedModelId,
      );

      const resumed = partialBytes > 0;

      attempts += 1;

      try {
        return Object.freeze({
          ...(await this.downloadAttempt(
            {
              modelId: normalizedModelId,

              artifact,

              finalPath,

              partialPath,

              partialBytes,

              resumed,

              expectedSha256,

              requestTimeoutMs,

              diskCheckIntervalMs,

              diskSafetyBufferBytes,
            },
            options,
          )),
          attempts,
        });
      } catch (error) {
        if (error instanceof ModelDownloadError && error.code === "ABORTED") {
          if (options.keepPartialOnAbort === false) {
            await fs.rm(partialPath, { force: true });
          }

          throw error;
        }

        const retryable = this.isRetryableDownloadError(error);

        if (!retryable || attempts > maxRetries) {
          if (error instanceof ModelDownloadError) {
            throw error;
          }

          throw new ModelDownloadError(
            `Download of "${normalizedModelId}" failed after ${attempts} attempt${
              attempts === 1 ? "" : "s"
            }.`,
            {
              code: "NETWORK",
              modelId: normalizedModelId,
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
    await fs.rm(filePath, { force: true });
  }

  public async removePartial(filePath: string): Promise<void> {
    await fs.rm(filePath, { force: true });
  }

  public async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);

      return true;
    } catch {
      return false;
    }
  }

  private validateArtifact(modelId: string, artifact: ModelArtifact): void {
    if (!artifact.id.trim()) {
      throw new ModelDownloadError(
        `Model "${modelId}" contains an artifact with an empty id.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    if (!artifact.url.trim()) {
      throw new ModelDownloadError(
        `Artifact "${artifact.id}" for model "${modelId}" has an empty URL.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    if (!artifact.filename.trim()) {
      throw new ModelDownloadError(
        `Artifact "${artifact.id}" for model "${modelId}" has an empty filename.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
      throw new ModelDownloadError(
        `Artifact "${artifact.id}" for model "${modelId}" must define a positive sizeBytes value.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }

    const sha256 = normalizeSha256(artifact.sha256);

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new ModelDownloadError(
        `Artifact "${artifact.id}" for model "${modelId}" has an invalid SHA-256 checksum.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }
  }

  private async downloadAttempt(
    context: DownloadAttemptContext,
    options: ModelDownloadOptions,
  ): Promise<Omit<ModelDownloadResult, "attempts">> {
    const {
      modelId,
      artifact,
      finalPath,
      partialPath,
      partialBytes,
      expectedSha256,
      requestTimeoutMs,
      diskCheckIntervalMs,
      diskSafetyBufferBytes,
    } = context;

    let resumed = partialBytes > 0;

    const attemptSignal = this.createAttemptSignal(
      options.signal,
      requestTimeoutMs,
    );

    let response: Response;

    try {
      response = await fetch(
        artifact.url,
        partialBytes > 0
          ? {
              headers: {
                Range: `bytes=${partialBytes}-`,
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
        throw new ModelDownloadError(`Download of "${modelId}" was aborted.`, {
          code: "ABORTED",
          modelId,
          retryable: false,
          cause: error,
        });
      }

      throw new ModelDownloadError(
        timedOut
          ? `The download request for "${modelId}" timed out.`
          : `Network error while downloading "${modelId}".`,
        {
          code: timedOut ? "NETWORK_TIMEOUT" : "NETWORK",
          modelId,
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
        partialBytes > 0 &&
        serverTotal !== null &&
        partialBytes === serverTotal
      ) {
        return this.finalizePartialFile(context, options);
      }

      await fs.rm(partialPath, { force: true });

      throw new ModelDownloadError(
        `The server rejected the resume range for "${modelId}".`,
        {
          code: "RANGE_NOT_SATISFIABLE",
          modelId,
          retryable: true,
        },
      );
    }

    if (this.isRetryableHttpStatus(response.status)) {
      const retryAfter = this.parseRetryAfterMs(
        response.headers.get("retry-after"),
      );

      attemptSignal.dispose();

      if (retryAfter !== null) {
        await sleep(
          Math.min(retryAfter, DEFAULT_RETRY_MAX_DELAY_MS),
          options.signal,
        );
      }

      throw new ModelDownloadError(
        `Server returned retryable HTTP status ${response.status} for "${modelId}".`,
        {
          code: "NETWORK",
          modelId,
          retryable: true,
        },
      );
    }

    if (!response.ok) {
      const body = await this.safeReadResponseText(response);

      attemptSignal.dispose();

      throw new ModelDownloadError(
        `Model artifact download failed with HTTP ${response.status}: ${
          body || response.statusText
        }`,
        {
          code: "HTTP_PERMANENT_FAILURE",
          modelId,
          retryable: false,
        },
      );
    }

    let actualPartialBytes = partialBytes;

    let totalBytes: number | null = artifact.sizeBytes;

    const contentLength = this.parseContentLength(
      response.headers.get("content-length"),
    );

    if (partialBytes > 0) {
      if (response.status === 200) {
        await fs.rm(partialPath, { force: true });

        actualPartialBytes = 0;

        resumed = false;
      } else if (response.status === 206) {
        const range = this.parseContentRange(
          response.headers.get("content-range"),
        );

        if (!range || range.start !== partialBytes) {
          attemptSignal.dispose();

          throw new ModelDownloadError(
            `Server returned an invalid Content-Range for artifact "${artifact.id}" of "${modelId}".`,
            {
              code: "CONTENT_RANGE_MISMATCH",
              modelId,
              retryable: true,
            },
          );
        }

        if (range.total !== null) {
          totalBytes = range.total;
        }

        const expectedRemaining =
          totalBytes !== null ? Math.max(0, totalBytes - partialBytes) : null;

        if (
          expectedRemaining !== null &&
          contentLength !== null &&
          contentLength !== expectedRemaining
        ) {
          attemptSignal.dispose();

          throw new ModelDownloadError(
            `Server Content-Length does not match the requested range for artifact "${artifact.id}".`,
            {
              code: "CONTENT_LENGTH_MISMATCH",
              modelId,
              retryable: true,
            },
          );
        }
      }
    }

    if (
      actualPartialBytes === 0 &&
      response.status === 200 &&
      artifact.sizeBytes !== undefined &&
      contentLength !== null &&
      contentLength !== artifact.sizeBytes
    ) {
      attemptSignal.dispose();

      throw new ModelDownloadError(
        `Content-Length mismatch for artifact "${artifact.id}".`,
        {
          code: "CONTENT_LENGTH_MISMATCH",
          modelId,
          retryable: false,
        },
      );
    }

    if (
      actualPartialBytes === 0 &&
      response.status === 200 &&
      contentLength !== null
    ) {
      totalBytes = contentLength;
    }

    await this.assertEnoughDiskSpace(
      options.destinationDirectory,
      totalBytes !== null ? Math.max(0, totalBytes - actualPartialBytes) : 0,
      diskSafetyBufferBytes,
      modelId,
    );

    const fileHandle = await fs.open(
      partialPath,
      actualPartialBytes > 0 && response.status === 206 ? "a" : "w",
    );

    try {
      await this.writeResponse(
        response,
        fileHandle,
        modelId,
        artifact.filename,
        actualPartialBytes,
        totalBytes,
        resumed,
        options,
        diskCheckIntervalMs,
        diskSafetyBufferBytes,
        attemptSignal,
      );

      await fileHandle.sync();
    } catch (error) {
      if (error instanceof ModelDownloadError && error.code === "DISK_SPACE") {
        throw error;
      }

      if (isDiskFullError(error)) {
        throw new ModelDownloadError(
          `The disk became full while downloading "${modelId}".`,
          {
            code: "DISK_SPACE",
            modelId,
            retryable: false,
            cause: error,
          },
        );
      }

      if (options.signal?.aborted) {
        throw new ModelDownloadError(`Download of "${modelId}" was aborted.`, {
          code: "ABORTED",
          modelId,
          retryable: false,
          cause: error,
        });
      }

      if (attemptSignal.didTimeout()) {
        throw new ModelDownloadError(
          `The download connection timed out for "${modelId}".`,
          {
            code: "NETWORK_TIMEOUT",
            modelId,
            retryable: true,
            cause: error,
          },
        );
      }

      throw new ModelDownloadError(
        `The connection was interrupted while downloading "${modelId}".`,
        {
          code: "NETWORK",
          modelId,
          retryable: true,
          cause: error,
        },
      );
    } finally {
      attemptSignal.dispose();

      await fileHandle.close();
    }

    const stat = await fs.stat(partialPath);

    if (totalBytes !== null && stat.size !== totalBytes) {
      throw new ModelDownloadError(
        `Downloaded size mismatch for "${modelId}". Expected ${totalBytes} bytes but received ${stat.size}.`,
        {
          code: "SIZE_MISMATCH",
          modelId,
          retryable: true,
        },
      );
    }

    if (stat.size !== artifact.sizeBytes) {
      throw new ModelDownloadError(
        `Artifact "${artifact.id}" size mismatch. Expected ${artifact.sizeBytes} bytes but received ${stat.size}.`,
        {
          code: "SIZE_MISMATCH",
          modelId,
          retryable: true,
        },
      );
    }

    throwIfAborted(modelId, options.signal);

    options.onProgress?.(
      Object.freeze({
        modelId,

        filename: artifact.filename,

        bytesDownloaded: stat.size,

        totalBytes: artifact.sizeBytes,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed,

        phase: "verifying",
      }),
    );

    const actualSha256 = await calculateFileSha256(partialPath);

    if (actualSha256 !== expectedSha256) {
      await fs.rm(partialPath, { force: true });

      throw new ModelDownloadError(
        `SHA-256 verification failed for artifact "${artifact.id}" of "${modelId}".`,
        {
          code: "CHECKSUM_MISMATCH",
          modelId,
          retryable: true,
        },
      );
    }

    await this.atomicCommit(partialPath, finalPath, modelId);

    options.onProgress?.(
      Object.freeze({
        modelId,

        filename: artifact.filename,

        bytesDownloaded: stat.size,

        totalBytes: artifact.sizeBytes,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed,

        phase: "completed",
      }),
    );

    return Object.freeze({
      modelId,

      artifactId: artifact.id,

      filename: artifact.filename,

      filePath: finalPath,

      bytesDownloaded: stat.size,

      sha256: actualSha256,

      resumed,
    });
  }

  private async finalizePartialFile(
    context: DownloadAttemptContext,
    options: ModelDownloadOptions,
  ): Promise<Omit<ModelDownloadResult, "attempts">> {
    const stat = await fs.stat(context.partialPath);

    if (stat.size !== context.artifact.sizeBytes) {
      await fs.rm(context.partialPath, { force: true });

      throw new ModelDownloadError(
        `The resumed artifact "${context.artifact.id}" has an invalid size.`,
        {
          code: "SIZE_MISMATCH",
          modelId: context.modelId,
          retryable: true,
        },
      );
    }

    const actualSha256 = await calculateFileSha256(context.partialPath);

    if (actualSha256 !== context.expectedSha256) {
      await fs.rm(context.partialPath, { force: true });

      throw new ModelDownloadError(
        `SHA-256 verification failed for artifact "${context.artifact.id}".`,
        {
          code: "CHECKSUM_MISMATCH",
          modelId: context.modelId,
          retryable: true,
        },
      );
    }

    await this.atomicCommit(
      context.partialPath,
      context.finalPath,
      context.modelId,
    );

    options.onProgress?.(
      Object.freeze({
        modelId: context.modelId,

        filename: context.artifact.filename,

        bytesDownloaded: stat.size,

        totalBytes: context.artifact.sizeBytes,

        percentage: 100,

        speedBytesPerSecond: 0,

        resumed: true,

        phase: "completed",
      }),
    );

    return Object.freeze({
      modelId: context.modelId,

      artifactId: context.artifact.id,

      filename: context.artifact.filename,

      filePath: context.finalPath,

      bytesDownloaded: stat.size,

      sha256: actualSha256,

      resumed: true,
    });
  }

  private async writeResponse(
    response: Response,
    fileHandle: Awaited<ReturnType<typeof fs.open>>,
    modelId: string,
    filename: string,
    initialBytes: number,
    totalBytes: number | null,
    resumed: boolean,
    options: ModelDownloadOptions,
    diskCheckIntervalMs: number,
    diskSafetyBufferBytes: number,
    attemptSignal: AttemptSignal,
  ): Promise<void> {
    if (!response.body) {
      throw new ModelDownloadError(
        `Artifact "${filename}" returned an empty response body.`,
        {
          code: "NETWORK",
          modelId,
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
        throwIfAborted(modelId, options.signal);

        if (Date.now() - lastDiskCheckAt >= diskCheckIntervalMs) {
          const remaining =
            totalBytes !== null ? Math.max(0, totalBytes - bytesDownloaded) : 0;

          await this.assertEnoughDiskSpace(
            options.destinationDirectory,
            remaining,
            diskSafetyBufferBytes,
            modelId,
          );

          lastDiskCheckAt = Date.now();
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
                `The disk became full while downloading "${modelId}".`,
                {
                  code: "DISK_SPACE",
                  modelId,
                  retryable: false,
                  cause: error,
                },
              );
            }

            throw error;
          }

          bytesDownloaded += value.byteLength;
        }

        const now = Date.now();

        if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
          const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1_000);

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
              modelId,

              filename,

              bytesDownloaded,

              totalBytes,

              percentage,

              speedBytesPerSecond: speed,

              resumed,

              phase: "downloading",
            }),
          );

          lastProgressAt = now;
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (attemptSignal.didTimeout()) {
      throw new ModelDownloadError(
        `The download connection timed out for "${modelId}".`,
        {
          code: "NETWORK_TIMEOUT",
          modelId,
          retryable: true,
        },
      );
    }
  }

  private async atomicCommit(
    partialPath: string,
    finalPath: string,
    modelId: string,
  ): Promise<void> {
    try {
      await fs.rm(finalPath, { force: true });

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
        `Veyra could not finalize the downloaded artifact for "${modelId}".`,
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
    expectedSizeBytes: number,
  ): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) {
        return false;
      }

      if (stat.size !== expectedSizeBytes) {
        return false;
      }

      return this.verifyChecksum(filePath, expectedSha256);
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
        `Insufficient disk space to continue downloading "${modelId}".`,
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
        `Artifact path for "${modelId}" escapes the model directory.`,
        {
          code: "INVALID_ARTIFACT",
          modelId,
          retryable: false,
        },
      );
    }
  }
}
