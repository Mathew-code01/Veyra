
// core/models/installation/KokoroPackageInstaller.ts

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * ============================================================================
 * Kokoro package completion installer
 * ============================================================================
 *
 * Purpose:
 *
 * The generic ModelPackageDownloader handles the primary model artifacts.
 *
 * Kokoro additionally requires a complete Transformers.js-compatible local
 * model directory:
 *
 *   config.json
 *   tokenizer.json
 *   tokenizer_config.json
 *   onnx/model_fp16.onnx
 *   voices/af_heart.bin
 *
 * This installer completes and verifies that local package structure.
 *
 * IMPORTANT:
 *
 * This is NOT another model manager.
 *
 * It is a Kokoro-specific package preparation/verification layer that sits
 * after the generic Veyra model installation.
 *
 * Upstream source:
 *
 *   https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
 *
 * ============================================================================
 */

const KOKORO_REPOSITORY =
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main";

const KOKORO_CONFIG_URL =
  `${KOKORO_REPOSITORY}/config.json?download=true`;

const KOKORO_TOKENIZER_URL =
  `${KOKORO_REPOSITORY}/tokenizer.json?download=true`;

const KOKORO_TOKENIZER_CONFIG_URL =
  `${KOKORO_REPOSITORY}/tokenizer_config.json?download=true`;

const KOKORO_MODEL_FP16_URL =
  `${KOKORO_REPOSITORY}/onnx/model_fp16.onnx?download=true`;

const KOKORO_AF_HEART_URL =
  `${KOKORO_REPOSITORY}/voices/af_heart.bin?download=true`;

/**
 * ============================================================================
 * Verified upstream binary metadata
 * ============================================================================
 *
 * model_fp16.onnx
 *
 * Size:
 *   163,234,740 bytes
 *
 * SHA-256:
 *   ba4527a874b42b21e35f468c10d326fdff3c7fc8cac1f85e9eb6c0dfc35c334a
 *
 * af_heart.bin
 *
 * Size:
 *   522,240 bytes
 *
 * SHA-256:
 *   d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b
 *
 * ============================================================================
 */

const VERIFIED_MODEL_FP16 = Object.freeze({
  sizeBytes: 163_234_740,

  sha256:
    "ba4527a874b42b21e35f468c10d326fdff3c7fc8cac1f85e9eb6c0dfc35c334a",
});

const VERIFIED_AF_HEART = Object.freeze({
  sizeBytes: 522_240,

  sha256:
    "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b",
});

/**
 * ============================================================================
 * Metadata sizes
 * ============================================================================
 *
 * We deliberately do NOT invent SHA-256 values for these small JSON files.
 *
 * They are validated by:
 *
 *   1. expected byte size
 *   2. JSON parsing
 *
 * ============================================================================
 */

const EXPECTED_METADATA_SIZES = Object.freeze({
  config: 44,

  tokenizer: 3_497,

  tokenizerConfig: 113,
});

/**
 * ============================================================================
 * Types
 * ============================================================================
 */

export interface KokoroPackageInstallOptions {
  readonly modelDirectory: string;

  /**
   * Existing model artifact path.
   *
   * This may point to an already-installed Veyra artifact.
   *
   * If the artifact is not the verified Kokoro v1.0 fp16 model, the installer
   * will download the verified upstream model into:
   *
   *   <modelDirectory>/onnx/model_fp16.onnx
   */
  readonly modelArtifactPath?: string;

  readonly voice?: string;

  readonly signal?: AbortSignal;

  readonly onProgress?: (progress: KokoroPackageProgress) => void;
}

export interface KokoroPackageProgress {
  readonly stage:
    | "metadata"
    | "voice"
    | "model"
    | "verification";

  readonly filename: string;

  readonly bytesDownloaded: number;

  readonly totalBytes: number;

  readonly percentage: number;
}

export interface KokoroPackageResult {
  readonly modelDirectory: string;

  readonly modelPath: string;

  readonly configPath: string;

  readonly tokenizerPath: string;

  readonly tokenizerConfigPath: string;

  readonly voicesDirectory: string;

  readonly voicePath: string;

  readonly voice: string;

  readonly totalBytes: number;

  readonly downloadedBytes: number;

  readonly reusedFiles: readonly string[];

  readonly downloadedFiles: readonly string[];
}

/**
 * ============================================================================
 * Filesystem helpers
 * ============================================================================
 */

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);

    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(
  directoryPath: string,
): Promise<boolean> {
  try {
    const stat = await fs.stat(directoryPath);

    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function ensureDirectory(
  directoryPath: string,
): Promise<void> {
  await fs.mkdir(directoryPath, {
    recursive: true,
  });
}

function throwIfAborted(
  signal?: AbortSignal,
): void {
  if (signal?.aborted) {
    throw new DOMException(
      "Kokoro package installation was aborted.",
      "AbortError",
    );
  }
}

/**
 * ============================================================================
 * Hashing
 * ============================================================================
 */

async function sha256File(
  filePath: string,
): Promise<string> {
  const hash = createHash("sha256");

  const file = await fs.open(filePath, "r");

  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);

    let position = 0;

    while (true) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        buffer.length,
        position,
      );

      if (bytesRead === 0) {
        break;
      }

      hash.update(
        buffer.subarray(0, bytesRead),
      );

      position += bytesRead;
    }
  } finally {
    await file.close();
  }

  return hash.digest("hex");
}

async function readFileSize(
  filePath: string,
): Promise<number> {
  const stat = await fs.stat(filePath);

  return stat.size;
}

/**
 * ============================================================================
 * Download
 * ============================================================================
 */

async function downloadFile(
  url: string,
  destinationPath: string,
  options: {
    readonly signal?: AbortSignal;

    readonly stage: KokoroPackageProgress["stage"];

    readonly filename: string;

    readonly expectedSizeBytes?: number;

    readonly expectedSha256?: string;

    readonly onProgress?: (
      progress: KokoroPackageProgress,
    ) => void;
  },
): Promise<{
  downloaded: boolean;

  bytes: number;
}> {
  throwIfAborted(options.signal);

  /**
   * --------------------------------------------------------------------------
   * Existing-file validation
   * --------------------------------------------------------------------------
   */

  if (await fileExists(destinationPath)) {
    const existingSize =
      await readFileSize(destinationPath);

    if (
      options.expectedSizeBytes !== undefined &&
      existingSize !== options.expectedSizeBytes
    ) {
      await fs.rm(destinationPath, {
        force: true,
      });
    } else if (options.expectedSha256) {
      const existingSha =
        await sha256File(destinationPath);

      if (
        existingSha.toLowerCase() ===
        options.expectedSha256.toLowerCase()
      ) {
        return {
          downloaded: false,

          bytes: existingSize,
        };
      }

      await fs.rm(destinationPath, {
        force: true,
      });
    } else {
      return {
        downloaded: false,

        bytes: existingSize,
      };
    }
  }

  await ensureDirectory(
    path.dirname(destinationPath),
  );

  const temporaryPath =
    `${destinationPath}.partial`;

  await fs.rm(temporaryPath, {
    force: true,
  });

  /**
   * --------------------------------------------------------------------------
   * HTTP download
   * --------------------------------------------------------------------------
   */

  const response = await fetch(url, {
    signal: options.signal,

    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download Kokoro asset "${options.filename}". ` +
        `HTTP ${response.status} ${response.statusText}`,
    );
  }

  const contentLengthHeader =
    response.headers.get("content-length");

  const contentLength =
    contentLengthHeader
      ? Number.parseInt(
          contentLengthHeader,
          10,
        )
      : undefined;

  if (
    contentLength !== undefined &&
    !Number.isFinite(contentLength)
  ) {
    throw new Error(
      `Invalid Content-Length returned for Kokoro asset "${options.filename}".`,
    );
  }

  const totalBytes =
    contentLength ??
    options.expectedSizeBytes ??
    0;

  const body = response.body;

  if (!body) {
    throw new Error(
      `The Kokoro asset response for "${options.filename}" has no readable body.`,
    );
  }

  const fileHandle =
    await fs.open(
      temporaryPath,
      "w",
    );

  let downloadedBytes = 0;

  try {
    const reader = body.getReader();

    while (true) {
      throwIfAborted(options.signal);

      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      const chunk = Buffer.from(value);

      await fileHandle.write(chunk);

      downloadedBytes += chunk.length;

      options.onProgress?.(
        Object.freeze({
          stage: options.stage,

          filename: options.filename,

          bytesDownloaded:
            downloadedBytes,

          totalBytes,

          percentage:
            totalBytes > 0
              ? Math.min(
                  100,
                  (downloadedBytes /
                    totalBytes) *
                    100,
                )
              : 0,
        }),
      );
    }
  } finally {
    await fileHandle.close();
  }

  /**
   * --------------------------------------------------------------------------
   * Size verification
   * --------------------------------------------------------------------------
   */

  if (
    options.expectedSizeBytes !== undefined &&
    downloadedBytes !==
      options.expectedSizeBytes
  ) {
    await fs.rm(temporaryPath, {
      force: true,
    });

    throw new Error(
      `Kokoro asset "${options.filename}" has an unexpected size. ` +
        `Expected ${options.expectedSizeBytes} bytes but received ${downloadedBytes} bytes.`,
    );
  }

  /**
   * --------------------------------------------------------------------------
   * SHA-256 verification
   * --------------------------------------------------------------------------
   */

  if (options.expectedSha256) {
    const actualSha256 =
      await sha256File(
        temporaryPath,
      );

    if (
      actualSha256.toLowerCase() !==
      options.expectedSha256.toLowerCase()
    ) {
      await fs.rm(temporaryPath, {
        force: true,
      });

      throw new Error(
        `Kokoro asset "${options.filename}" failed SHA-256 verification. ` +
          `Expected ${options.expectedSha256} but received ${actualSha256}.`,
      );
    }
  }

  /**
   * --------------------------------------------------------------------------
   * Atomic replacement
   * --------------------------------------------------------------------------
   */

  await fs.rm(destinationPath, {
    force: true,
  });

  await fs.rename(
    temporaryPath,
    destinationPath,
  );

  return {
    downloaded: true,

    bytes: downloadedBytes,
  };
}

/**
 * ============================================================================
 * JSON verification
 * ============================================================================
 */

async function verifyJsonFile(
  filePath: string,
  filename: string,
  expectedSizeBytes: number,
): Promise<void> {
  if (!(await fileExists(filePath))) {
    throw new Error(
      `Required Kokoro metadata file is missing: ${filePath}`,
    );
  }

  const size =
    await readFileSize(filePath);

  if (size !== expectedSizeBytes) {
    throw new Error(
      `Kokoro ${filename} has an unexpected size. ` +
        `Expected ${expectedSizeBytes} bytes but found ${size} bytes.`,
    );
  }

  const raw =
    await fs.readFile(
      filePath,
      "utf8",
    );

  try {
    JSON.parse(raw);
  } catch (error) {
    /**
     * IMPORTANT:
     *
     * Preserve the original parser exception.
     *
     * This satisfies ESLint's:
     *
     *   @typescript-eslint/preserve-caught-error
     */
    throw new Error(
      `Kokoro ${filename} is not valid JSON: ` +
        `${
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
 * ============================================================================
 * Model verification
 * ============================================================================
 */

async function verifyModelArtifact(
  modelPath: string,
): Promise<void> {
  if (!(await fileExists(modelPath))) {
    throw new Error(
      `Kokoro ONNX model is missing: ${modelPath}`,
    );
  }

  const size =
    await readFileSize(modelPath);

  if (
    size !==
    VERIFIED_MODEL_FP16.sizeBytes
  ) {
    throw new Error(
      `Kokoro ONNX model has an unexpected size. ` +
        `Expected ${VERIFIED_MODEL_FP16.sizeBytes} bytes but found ${size} bytes.`,
    );
  }

  const sha256 =
    await sha256File(modelPath);

  if (
    sha256.toLowerCase() !==
    VERIFIED_MODEL_FP16.sha256.toLowerCase()
  ) {
    throw new Error(
      `Kokoro ONNX model failed SHA-256 verification. ` +
        `Expected ${VERIFIED_MODEL_FP16.sha256} but received ${sha256}.`,
    );
  }
}

/**
 * ============================================================================
 * Voice verification
 * ============================================================================
 */

async function verifyVoice(
  voicePath: string,
): Promise<void> {
  if (!(await fileExists(voicePath))) {
    throw new Error(
      `Kokoro voice asset is missing: ${voicePath}`,
    );
  }

  const size =
    await readFileSize(voicePath);

  if (
    size !==
    VERIFIED_AF_HEART.sizeBytes
  ) {
    throw new Error(
      `Kokoro af_heart voice has an unexpected size. ` +
        `Expected ${VERIFIED_AF_HEART.sizeBytes} bytes but found ${size} bytes.`,
    );
  }

  const sha256 =
    await sha256File(voicePath);

  if (
    sha256.toLowerCase() !==
    VERIFIED_AF_HEART.sha256.toLowerCase()
  ) {
    throw new Error(
      `Kokoro af_heart voice failed SHA-256 verification. ` +
        `Expected ${VERIFIED_AF_HEART.sha256} but received ${sha256}.`,
    );
  }
}

/**
 * ============================================================================
 * Main installer
 * ============================================================================
 */

export class KokoroPackageInstaller {
  public async install(
    options: KokoroPackageInstallOptions,
  ): Promise<KokoroPackageResult> {
    throwIfAborted(options.signal);

    const modelDirectory =
      path.resolve(
        options.modelDirectory,
      );

    const voice =
      options.voice?.trim() ||
      "af_heart";

    if (voice !== "af_heart") {
      throw new Error(
        `KokoroPackageInstaller currently supports the verified ` +
          `"af_heart" voice only. Requested: "${voice}".`,
      );
    }

    await ensureDirectory(
      modelDirectory,
    );

    /**
     * ------------------------------------------------------------------------
     * Directory structure
     * ------------------------------------------------------------------------
     */

    const onnxDirectory =
      path.join(
        modelDirectory,
        "onnx",
      );

    const voicesDirectory =
      path.join(
        modelDirectory,
        "voices",
      );

    await ensureDirectory(
      onnxDirectory,
    );

    await ensureDirectory(
      voicesDirectory,
    );

    /**
     * ------------------------------------------------------------------------
     * Required paths
     * ------------------------------------------------------------------------
     */

    const configPath =
      path.join(
        modelDirectory,
        "config.json",
      );

    const tokenizerPath =
      path.join(
        modelDirectory,
        "tokenizer.json",
      );

    const tokenizerConfigPath =
      path.join(
        modelDirectory,
        "tokenizer_config.json",
      );

    const voicePath =
      path.join(
        voicesDirectory,
        `${voice}.bin`,
      );

    const canonicalModelPath =
      path.join(
        onnxDirectory,
        "model_fp16.onnx",
      );

    const downloadedFiles: string[] = [];

    const reusedFiles: string[] = [];

    let downloadedBytes = 0;

    let totalBytes = 0;

    /**
     * ------------------------------------------------------------------------
     * Metadata
     * ------------------------------------------------------------------------
     */

    const metadataAssets = [
      {
        url: KOKORO_CONFIG_URL,

        destinationPath:
          configPath,

        filename:
          "config.json",

        expectedSizeBytes:
          EXPECTED_METADATA_SIZES.config,
      },

      {
        url: KOKORO_TOKENIZER_URL,

        destinationPath:
          tokenizerPath,

        filename:
          "tokenizer.json",

        expectedSizeBytes:
          EXPECTED_METADATA_SIZES.tokenizer,
      },

      {
        url:
          KOKORO_TOKENIZER_CONFIG_URL,

        destinationPath:
          tokenizerConfigPath,

        filename:
          "tokenizer_config.json",

        expectedSizeBytes:
          EXPECTED_METADATA_SIZES.tokenizerConfig,
      },
    ] as const;

    for (const asset of metadataAssets) {
      throwIfAborted(
        options.signal,
      );

      const result =
        await downloadFile(
          asset.url,
          asset.destinationPath,
          {
            stage: "metadata",

            filename:
              asset.filename,

            expectedSizeBytes:
              asset.expectedSizeBytes,

            signal:
              options.signal,

            onProgress:
              options.onProgress,
          },
        );

      totalBytes +=
        asset.expectedSizeBytes;

      if (result.downloaded) {
        downloadedFiles.push(
          asset.filename,
        );

        downloadedBytes +=
          result.bytes;
      } else {
        reusedFiles.push(
          asset.filename,
        );
      }
    }

    /**
     * ------------------------------------------------------------------------
     * Voice
     * ------------------------------------------------------------------------
     */

    const voiceResult =
      await downloadFile(
        KOKORO_AF_HEART_URL,
        voicePath,
        {
          stage: "voice",

          filename:
            `${voice}.bin`,

          expectedSizeBytes:
            VERIFIED_AF_HEART.sizeBytes,

          expectedSha256:
            VERIFIED_AF_HEART.sha256,

          signal:
            options.signal,

          onProgress:
            options.onProgress,
        },
      );

    totalBytes +=
      VERIFIED_AF_HEART.sizeBytes;

    if (voiceResult.downloaded) {
      downloadedFiles.push(
        `voices/${voice}.bin`,
      );

      downloadedBytes +=
        voiceResult.bytes;
    } else {
      reusedFiles.push(
        `voices/${voice}.bin`,
      );
    }

    /**
     * ------------------------------------------------------------------------
     * Model
     * ------------------------------------------------------------------------
     *
     * We deliberately verify the canonical v1.0 model.
     *
     * If the generic Veyra installer previously placed a different Kokoro
     * artifact at the root, we do NOT silently accept it.
     *
     * Instead we install the verified v1.0 model at the canonical:
     *
     *   onnx/model_fp16.onnx
     *
     * path.
     * ------------------------------------------------------------------------
     */

    let modelDownloaded = false;

    if (await fileExists(canonicalModelPath)) {
      try {
        await verifyModelArtifact(
          canonicalModelPath,
        );
      } catch {
        await fs.rm(
          canonicalModelPath,
          {
            force: true,
          },
        );
      }
    }

    if (
      !(await fileExists(
        canonicalModelPath,
      ))
    ) {
      const modelResult =
        await downloadFile(
          KOKORO_MODEL_FP16_URL,
          canonicalModelPath,
          {
            stage: "model",

            filename:
              "onnx/model_fp16.onnx",

            expectedSizeBytes:
              VERIFIED_MODEL_FP16.sizeBytes,

            expectedSha256:
              VERIFIED_MODEL_FP16.sha256,

            signal:
              options.signal,

            onProgress:
              options.onProgress,
          },
        );

      modelDownloaded =
        modelResult.downloaded;

      downloadedBytes +=
        modelResult.bytes;
    }

    totalBytes +=
      VERIFIED_MODEL_FP16.sizeBytes;

    if (modelDownloaded) {
      downloadedFiles.push(
        "onnx/model_fp16.onnx",
      );
    } else {
      reusedFiles.push(
        "onnx/model_fp16.onnx",
      );
    }

    /**
     * ------------------------------------------------------------------------
     * Final verification
     * ------------------------------------------------------------------------
     */

    options.onProgress?.(
      Object.freeze({
        stage:
          "verification",

        filename:
          "Kokoro package",

        bytesDownloaded:
          totalBytes,

        totalBytes,

        percentage: 100,
      }),
    );

    await verifyJsonFile(
      configPath,
      "config.json",
      EXPECTED_METADATA_SIZES.config,
    );

    await verifyJsonFile(
      tokenizerPath,
      "tokenizer.json",
      EXPECTED_METADATA_SIZES.tokenizer,
    );

    await verifyJsonFile(
      tokenizerConfigPath,
      "tokenizer_config.json",
      EXPECTED_METADATA_SIZES.tokenizerConfig,
    );

    await verifyModelArtifact(
      canonicalModelPath,
    );

    await verifyVoice(
      voicePath,
    );

    if (
      !(await directoryExists(
        voicesDirectory,
      ))
    ) {
      throw new Error(
        `Kokoro voices directory does not exist: ${voicesDirectory}`,
      );
    }

    if (
      !(await directoryExists(
        onnxDirectory,
      ))
    ) {
      throw new Error(
        `Kokoro ONNX directory does not exist: ${onnxDirectory}`,
      );
    }

    return Object.freeze({
      modelDirectory,

      modelPath:
        canonicalModelPath,

      configPath,

      tokenizerPath,

      tokenizerConfigPath,

      voicesDirectory,

      voicePath,

      voice,

      totalBytes,

      downloadedBytes,

      reusedFiles:
        Object.freeze([
          ...reusedFiles,
        ]),

      downloadedFiles:
        Object.freeze([
          ...downloadedFiles,
        ]),
    });
  }
}
