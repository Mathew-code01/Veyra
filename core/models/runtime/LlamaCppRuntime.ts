
// core/models/runtime/LlamaCppRuntime.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  ModelRuntimeGenerateOptions,
  ModelRuntimeGenerationResult,
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
  VisionGenerationOptions,
  VisionGenerationRuntime,
} from "./ModelRuntime";

/**
 * ============================================================================
 * Configuration
 * ============================================================================
 */

export interface LlamaCppRuntimeOptions {
  /**
   * Absolute path to llama-server executable.
   *
   * Example on Windows:
   *
   * C:\Veyra\tools\llama\llama-server.exe
   */
  readonly executablePath: string;

  /**
   * Local HTTP interface.
   */
  readonly host?: string;

  /**
   * Port used by llama-server.
   */
  readonly port?: number;

  /**
   * Maximum startup wait.
   */
  readonly startupTimeoutMs?: number;

  /**
   * Health polling frequency.
   */
  readonly healthPollIntervalMs?: number;

  /**
   * Maximum shutdown wait.
   */
  readonly shutdownTimeoutMs?: number;

  /**
   * Whether to request multimodal projector GPU offload.
   */
  readonly mmprojGpuOffload?: boolean;
}

/**
 * ============================================================================
 * Process type
 * ============================================================================
 */

type LlamaServerProcess = ChildProcessByStdio<null, Readable, Readable>;

/**
 * ============================================================================
 * Defaults
 * ============================================================================
 */

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 39271;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_POLL_INTERVAL_MS = 250;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * ============================================================================
 * Abort / timing helpers
 * ============================================================================
 */

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);

    timer.unref?.();
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * ============================================================================
 * Image helpers
 * ============================================================================
 */

function getImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".png":
      return "image/png";

    case ".webp":
      return "image/webp";

    case ".gif":
      return "image/gif";

    case ".bmp":
      return "image/bmp";

    case ".tif":
    case ".tiff":
      return "image/tiff";

    default:
      throw new Error(
        `Unsupported image file type "${extension || "(none)"}".`,
      );
  }
}

async function fileToDataUrl(
  filePath: string,
  explicitMimeType?: string,
): Promise<string> {
  const normalizedPath = path.resolve(filePath.trim());

  if (!normalizedPath) {
    throw new Error("Image path cannot be empty.");
  }

  const file = await fs.readFile(normalizedPath);

  const mimeType =
    explicitMimeType?.trim() || getImageMimeType(normalizedPath);

  return `data:${mimeType};base64,${file.toString("base64")}`;
}

/**
 * ============================================================================
 * Runtime
 * ============================================================================
 */

export class LlamaCppRuntime implements VisionGenerationRuntime {
  public readonly name = "llama_cpp";

  private process: LlamaServerProcess | null = null;

  private loadedModel: ModelDefinition | null = null;

  private baseUrl: string;

  private multimodalEnabled = false;

  private lastProcessError: Error | null = null;

  private readonly host: string;

  private readonly port: number;

  private readonly startupTimeoutMs: number;

  private readonly healthPollIntervalMs: number;

  private readonly shutdownTimeoutMs: number;

  private readonly mmprojGpuOffload: boolean;

  private readonly options: LlamaCppRuntimeOptions;

  public constructor(options: LlamaCppRuntimeOptions) {
    const executablePath = options.executablePath.trim();

    if (!executablePath) {
      throw new Error("LlamaCppRuntime requires an executablePath.");
    }

    this.host = options.host?.trim() || DEFAULT_HOST;

    this.port = Math.max(
      1,
      Math.floor(options.port ?? DEFAULT_PORT),
    );

    this.startupTimeoutMs = Math.max(
      1_000,
      Math.floor(
        options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      ),
    );

    this.healthPollIntervalMs = Math.max(
      50,
      Math.floor(
        options.healthPollIntervalMs ??
          DEFAULT_HEALTH_POLL_INTERVAL_MS,
      ),
    );

    this.shutdownTimeoutMs = Math.max(
      1_000,
      Math.floor(
        options.shutdownTimeoutMs ??
          DEFAULT_SHUTDOWN_TIMEOUT_MS,
      ),
    );

    this.mmprojGpuOffload =
      options.mmprojGpuOffload ?? true;

    this.options = {
      ...options,
      executablePath,
    };

    this.baseUrl = `http://${this.host}:${this.port}`;
  }

  /**
   * ==========================================================================
   * Model support
   * ==========================================================================
   */

  public supports(model: ModelDefinition): boolean {
    return model.runtime === "llama_cpp";
  }

  /**
   * ==========================================================================
   * Load model
   * ==========================================================================
   */

  public async load(
    model: ModelDefinition,
    options: ModelRuntimeLoadOptions,
  ): Promise<void> {
    if (!this.supports(model)) {
      throw new Error(
        `LlamaCppRuntime cannot execute runtime "${model.runtime}".`,
      );
    }

    throwIfAborted(options.signal);

    const modelPath = path.resolve(options.modelPath.trim());

    if (!modelPath) {
      throw new Error(
        `A model path is required for "${model.id}".`,
      );
    }

    await this.assertReadableFile(
      modelPath,
      `Model artifact for "${model.id}"`,
    );

    /*
     * Only one llama-server process is kept alive.
     */
    await this.unload();

    const args: string[] = [
      "--model",
      modelPath,

      "--host",
      this.host,

      "--port",
      String(this.port),
    ];

    if (options.contextSize !== undefined) {
      this.validatePositiveInteger(
        options.contextSize,
        "contextSize",
      );

      args.push(
        "--ctx-size",
        String(Math.floor(options.contextSize)),
      );
    }

    if (options.gpuLayers !== undefined) {
      if (!Number.isInteger(options.gpuLayers)) {
        throw new Error("gpuLayers must be an integer.");
      }

      args.push(
        "--n-gpu-layers",
        String(options.gpuLayers),
      );
    }

    if (options.threads !== undefined) {
      this.validatePositiveInteger(
        options.threads,
        "threads",
      );

      args.push(
        "--threads",
        String(Math.floor(options.threads)),
      );
    }

    if (options.batchSize !== undefined) {
      this.validatePositiveInteger(
        options.batchSize,
        "batchSize",
      );

      args.push(
        "--batch-size",
        String(Math.floor(options.batchSize)),
      );
    }

    /**
     * ------------------------------------------------------------------------
     * Multimodal support
     * ------------------------------------------------------------------------
     */

    this.multimodalEnabled =
      Boolean(model.capabilities.visionUnderstanding);

    if (this.multimodalEnabled) {
      const mmprojPath =
        options.artifactPaths?.mmproj;

      if (!mmprojPath) {
        throw new Error(
          `Vision model "${model.id}" is missing its required "mmproj" artifact.`,
        );
      }

      const resolvedMmprojPath =
        path.resolve(mmprojPath.trim());

      await this.assertReadableFile(
        resolvedMmprojPath,
        `Multimodal projector for "${model.id}"`,
      );

      args.push(
        "--mmproj",
        resolvedMmprojPath,
      );

      if (!this.mmprojGpuOffload) {
        args.push("--no-mmproj-offload");
      }
    }

    this.lastProcessError = null;

    const child = this.spawnServer(args);

    this.process = child;

    try {
      await this.waitUntilReady(
        this.startupTimeoutMs,
        options.signal,
      );

      throwIfAborted(options.signal);

      this.loadedModel = model;
    } catch (error) {
      await this.unload();

      throw new Error(
        `Failed to load "${model.displayName}" into llama.cpp: ${getErrorMessage(error)}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * ==========================================================================
   * Text generation
   * ==========================================================================
   */

  public async generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    const model = this.requireLoadedModel();

    throwIfAborted(options.signal);

    const prompt = options.prompt.trim();

    if (!prompt) {
      throw new Error(
        "Generation prompt cannot be empty.",
      );
    }

    const startedAt = Date.now();

    const response = await fetch(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        signal: options.signal,

        body: JSON.stringify({
          model: model.id,

          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],

          stream:
            typeof options.onToken === "function",

          temperature:
            options.temperature ?? 0.2,

          top_p:
            options.topP ?? 0.9,

          max_tokens:
            options.maxTokens ?? 256,
        }),
      },
    );

    if (!response.ok) {
      await this.throwHttpError(
        response,
        "llama.cpp text generation",
      );
    }

    if (
      typeof options.onToken === "function"
    ) {
      return this.consumeStreamingResponse(
        response,
        startedAt,
        options,
      );
    }

    const payload: unknown =
      await response.json();

    const text =
      this.extractResponseText(payload);

    return Object.freeze({
      text,

      durationMs:
        Date.now() - startedAt,

      firstTokenMs:
        undefined,

      tokensPerSecond:
        this.extractTokensPerSecond(
          payload,
          startedAt,
        ),
    });
  }

  /**
   * ==========================================================================
   * Vision generation
   * ==========================================================================
   */

  public async generateVision(
    options: VisionGenerationOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    const model =
      this.requireLoadedModel();

    if (!this.multimodalEnabled) {
      throw new Error(
        `Loaded model "${model.id}" does not have multimodal support enabled.`,
      );
    }

    throwIfAborted(options.signal);

    const hasImagePath =
      Boolean(options.imagePath?.trim());

    const hasImageDataUrl =
      Boolean(options.imageDataUrl?.trim());

    if (
      hasImagePath &&
      hasImageDataUrl
    ) {
      throw new Error(
        "Provide either imagePath or imageDataUrl, not both.",
      );
    }

    if (
      !hasImagePath &&
      !hasImageDataUrl
    ) {
      throw new Error(
        "Vision generation requires imagePath or imageDataUrl.",
      );
    }

    const imageDataUrl =
      hasImageDataUrl
        ? options.imageDataUrl!.trim()
        : await fileToDataUrl(
            options.imagePath!,
            options.imageMimeType,
          );

    if (
      !imageDataUrl.startsWith(
        "data:image/",
      )
    ) {
      throw new Error(
        "Vision imageDataUrl must contain an image data URL.",
      );
    }

    const prompt =
      options.prompt.trim();

    if (!prompt) {
      throw new Error(
        "Vision prompt cannot be empty.",
      );
    }

    const startedAt = Date.now();

    const response = await fetch(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        signal: options.signal,

        body: JSON.stringify({
          model: model.id,

          messages: [
            {
              role: "user",

              content: [
                {
                  type: "text",
                  text: prompt,
                },

                {
                  type: "image_url",

                  image_url: {
                    url: imageDataUrl,
                  },
                },
              ],
            },
          ],

          stream:
            typeof options.onToken === "function",

          temperature:
            options.temperature ?? 0.2,

          top_p:
            options.topP ?? 0.9,

          max_tokens:
            options.maxTokens ?? 256,
        }),
      },
    );

    if (!response.ok) {
      await this.throwHttpError(
        response,
        "llama.cpp vision generation",
      );
    }

    if (
      typeof options.onToken === "function"
    ) {
      return this.consumeStreamingResponse(
        response,
        startedAt,
        options,
      );
    }

    const payload: unknown =
      await response.json();

    const text =
      this.extractResponseText(payload);

    return Object.freeze({
      text,

      durationMs:
        Date.now() - startedAt,

      firstTokenMs:
        undefined,

      tokensPerSecond:
        this.extractTokensPerSecond(
          payload,
          startedAt,
        ),
    });
  }

  /**
   * ==========================================================================
   * Health
   * ==========================================================================
   */

  public async health(): Promise<ModelRuntimeHealth> {
    try {
      const response =
        await fetch(
          `${this.baseUrl}/health`,
        );

      return Object.freeze({
        ready: response.ok,

        loadedModelId:
          this.loadedModel?.id ?? null,

        runtimeName: this.name,
      });
    } catch {
      return Object.freeze({
        ready: false,

        loadedModelId:
          this.loadedModel?.id ?? null,

        runtimeName: this.name,
      });
    }
  }

  /**
   * ==========================================================================
   * Unload
   * ==========================================================================
   */

  public async unload(): Promise<void> {
    const child = this.process;

    this.process = null;

    this.loadedModel = null;

    this.multimodalEnabled = false;

    this.lastProcessError = null;

    if (!child) {
      return;
    }

    if (
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }

    try {
      child.kill();
    } catch {
      /*
       * Process may already have exited.
       */
    }

    await new Promise<void>(
      (resolve) => {
        let settled = false;

        const finish = (): void => {
          if (settled) {
            return;
          }

          settled = true;

          clearTimeout(timeout);

          resolve();
        };

        const timeout = setTimeout(
          () => {
            if (
              child.exitCode === null &&
              child.signalCode === null
            ) {
              try {
                child.kill("SIGKILL");
              } catch {
                /*
                 * Process may have
                 * already exited.
                 */
              }
            }

            finish();
          },
          this.shutdownTimeoutMs,
        );

        child.once(
          "exit",
          finish,
        );
      },
    );
  }

  /**
   * ==========================================================================
   * Process creation
   * ==========================================================================
   */

  private spawnServer(
    args: readonly string[],
  ): LlamaServerProcess {
    const child = spawn(
      this.options.executablePath,
      [...args],
      {
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],

        windowsHide:
          process.platform === "win32",

        detached: false,
      },
    );

    child.stdout.setEncoding(
      "utf8",
    );

    child.stderr.setEncoding(
      "utf8",
    );

    /*
     * Consume stdout so the process
     * cannot block on a full pipe.
     */
    child.stdout.on(
      "data",
      () => {
        /*
         * Runtime logging can be connected
         * to the central Veyra logger later.
         */
      },
    );

    /*
     * Consume stderr and retain the
     * latest diagnostic message.
     */
    child.stderr.on(
      "data",
      (chunk: string) => {
        const text =
          String(chunk).trim();

        if (text) {
          this.lastProcessError =
            new Error(text);
        }
      },
    );

    child.once(
      "error",
      (error) => {
        this.lastProcessError =
          error;

        if (
          this.process === child
        ) {
          this.process = null;

          this.loadedModel = null;

          this.multimodalEnabled =
            false;
        }
      },
    );

    child.once(
      "exit",
      (code, signal) => {
        if (
          this.process === child
        ) {
          this.process = null;

          this.loadedModel = null;

          this.multimodalEnabled =
            false;

          if (
            code !== 0 &&
            this.lastProcessError === null
          ) {
            this.lastProcessError =
              new Error(
                `llama-server exited unexpectedly with code ${String(code)}${signal ? ` due to ${signal}` : ""}.`,
              );
          }
        }
      },
    );

    return child;
  }

  /**
   * ==========================================================================
   * Startup readiness
   * ==========================================================================
   */

  private async waitUntilReady(
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const startedAt =
      Date.now();

    while (
      Date.now() - startedAt <
      timeoutMs
    ) {
      throwIfAborted(signal);

      const processError =
        this.lastProcessError;

      if (processError) {
        throw processError;
      }

      const child =
        this.process;

      if (!child) {
        throw new Error(
          "llama-server process terminated before becoming ready.",
        );
      }

      if (
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        throw new Error(
          "llama-server process exited before becoming ready.",
        );
      }

      const health =
        await this.health();

      if (health.ready) {
        return;
      }

      await sleep(
        this.healthPollIntervalMs,
      );
    }

    throw new Error(
      `llama-server did not become ready within ${timeoutMs}ms.`,
    );
  }

  /**
   * ==========================================================================
   * Streaming response
   * ==========================================================================
   */

  private async consumeStreamingResponse(
    response: Response,
    startedAt: number,
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    if (!response.body) {
      throw new Error(
        "llama.cpp returned an empty streaming response.",
      );
    }

    const reader =
      response.body.getReader();

    const decoder =
      new TextDecoder();

    let buffer = "";

    let text = "";

    let firstTokenMs:
      | number
      | undefined;

    try {
      while (true) {
        throwIfAborted(
          options.signal,
        );

        const {
          done,
          value,
        } = await reader.read();

        if (done) {
          break;
        }

        buffer +=
          decoder.decode(
            value,
            {
              stream: true,
            },
          );

        const events =
          buffer.split(
            /\r?\n\r?\n/,
          );

        buffer =
          events.pop() ?? "";

        for (
          const event of events
        ) {
          const token =
            this.extractStreamingToken(
              event,
            );

          if (!token) {
            continue;
          }

          if (
            firstTokenMs ===
            undefined
          ) {
            firstTokenMs =
              Date.now() -
              startedAt;
          }

          text += token;

          options.onToken?.(
            token,
          );
        }
      }

      buffer +=
        decoder.decode();

      const finalToken =
        this.extractStreamingToken(
          buffer,
        );

      if (finalToken) {
        if (
          firstTokenMs ===
          undefined
        ) {
          firstTokenMs =
            Date.now() -
            startedAt;
        }

        text += finalToken;

        options.onToken?.(
          finalToken,
        );
      }
    } finally {
      reader.releaseLock();
    }

    const durationMs =
      Date.now() -
      startedAt;

    return Object.freeze({
      text,

      durationMs,

      firstTokenMs,

      tokensPerSecond:
        this.calculateTokensPerSecond(
          text,
          durationMs,
        ),
    });
  }

  private extractStreamingToken(
    event: string,
  ): string | null {
    const lines =
      event.split(/\r?\n/);

    for (
      const line of lines
    ) {
      const trimmed =
        line.trim();

      if (
        !trimmed.startsWith(
          "data:",
        )
      ) {
        continue;
      }

      const data =
        trimmed
          .slice(5)
          .trim();

      if (
        !data ||
        data === "[DONE]"
      ) {
        continue;
      }

      try {
        const payload:
          unknown =
          JSON.parse(data);

        if (
          !payload ||
          typeof payload !==
            "object"
        ) {
          continue;
        }

        const choices =
          (
            payload as Record<
              string,
              unknown
            >
          ).choices;

        if (
          !Array.isArray(
            choices,
          ) ||
          choices.length === 0
        ) {
          continue;
        }

        const choice =
          choices[0];

        if (
          !choice ||
          typeof choice !==
            "object"
        ) {
          continue;
        }

        const delta =
          (
            choice as Record<
              string,
              unknown
            >
          ).delta;

        if (
          !delta ||
          typeof delta !==
            "object"
        ) {
          continue;
        }

        const content =
          (
            delta as Record<
              string,
              unknown
            >
          ).content;

        if (
          typeof content ===
          "string"
        ) {
          return content;
        }
      } catch {
        /*
         * Ignore malformed or
         * incomplete SSE frames.
         */
      }
    }

    return null;
  }

  /**
   * ==========================================================================
   * Response parsing
   * ==========================================================================
   */

  private extractResponseText(
    payload: unknown,
  ): string {
    if (
      !payload ||
      typeof payload !==
        "object"
    ) {
      throw new Error(
        "Invalid llama.cpp response.",
      );
    }

    const choices =
      (
        payload as Record<
          string,
          unknown
        >
      ).choices;

    if (
      !Array.isArray(choices) ||
      choices.length === 0
    ) {
      throw new Error(
        "llama.cpp response did not contain choices.",
      );
    }

    const firstChoice =
      choices[0];

    if (
      !firstChoice ||
      typeof firstChoice !==
        "object"
    ) {
      throw new Error(
        "Invalid llama.cpp choice.",
      );
    }

    const message =
      (
        firstChoice as Record<
          string,
          unknown
        >
      ).message;

    if (
      !message ||
      typeof message !==
        "object"
    ) {
      throw new Error(
        "llama.cpp response did not contain a message.",
      );
    }

    const content =
      (
        message as Record<
          string,
          unknown
        >
      ).content;

    if (
      typeof content !==
      "string"
    ) {
      throw new Error(
        "llama.cpp response content was not text.",
      );
    }

    return content;
  }

  private extractTokensPerSecond(
    payload: unknown,
    startedAt: number,
  ): number | undefined {
    if (
      payload &&
      typeof payload ===
        "object"
    ) {
      const usage =
        (
          payload as Record<
            string,
            unknown
          >
        ).usage;

      if (
        usage &&
        typeof usage ===
          "object"
      ) {
        const completionTokens =
          (
            usage as Record<
              string,
              unknown
            >
          ).completion_tokens;

        if (
          typeof completionTokens ===
            "number" &&
          completionTokens > 0
        ) {
          const durationMs =
            Date.now() -
            startedAt;

          if (
            durationMs > 0
          ) {
            return (
              completionTokens /
              (durationMs / 1000)
            );
          }
        }
      }
    }

    return undefined;
  }

  private calculateTokensPerSecond(
    text: string,
    durationMs: number,
  ): number | undefined {
    if (
      !text ||
      durationMs <= 0
    ) {
      return undefined;
    }

    /*
     * llama.cpp streaming does not
     * expose usage consistently across
     * all server versions.
     *
     * This is therefore an estimate.
     */
    const estimatedTokens =
      Math.max(
        1,
        Math.round(
          text.length / 4,
        ),
      );

    return (
      estimatedTokens /
      (durationMs / 1000)
    );
  }

  /**
   * ==========================================================================
   * Model/file validation
   * ==========================================================================
   */

  private requireLoadedModel(): ModelDefinition {
    if (!this.loadedModel) {
      throw new Error(
        "No model is currently loaded in llama.cpp.",
      );
    }

    return this.loadedModel;
  }

  private async assertReadableFile(
    filePath: string,
    label: string,
  ): Promise<void> {
    try {
      const stat =
        await fs.stat(filePath);

      if (!stat.isFile()) {
        throw new Error(
          `${label} is not a regular file.`,
        );
      }

      await fs.access(
        filePath,
      );
    } catch (error) {
      throw new Error(
        `${label} is not accessible: ${filePath}`,
        {
          cause: error,
        },
      );
    }
  }

  private validatePositiveInteger(
    value: number,
    name: string,
  ): void {
    if (
      !Number.isSafeInteger(
        value,
      ) ||
      value <= 0
    ) {
      throw new Error(
        `${name} must be a positive safe integer.`,
      );
    }
  }

  /**
   * ==========================================================================
   * HTTP error handling
   * ==========================================================================
   */

  private async throwHttpError(
    response: Response,
    operation: string,
  ): Promise<never> {
    let diagnosticBody =
      "no diagnostic body";

    try {
      const responseBody =
        await response.text();

      if (
        responseBody.trim()
      ) {
        diagnosticBody =
          responseBody.trim();
      }
    } catch {
      diagnosticBody =
        "unable to read response body";
    }

    throw new Error(
      `${operation} failed with HTTP ${response.status}: ${diagnosticBody}`,
    );
  }
}
