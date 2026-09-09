// core/models/runtime/LlamaCppRuntime.ts

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  ModelRuntime,
  ModelRuntimeGenerateOptions,
  ModelRuntimeGenerationResult,
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
} from "./ModelRuntime";

export interface LlamaCppRuntimeOptions {
  readonly executablePath: string;

  readonly host?: string;

  readonly port?: number;

  readonly startupTimeoutMs?: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 39271;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

export class LlamaCppRuntime implements ModelRuntime {
  public readonly name = "llama_cpp";

  private process: ChildProcessWithoutNullStreams | null = null;

  private loadedModel: ModelDefinition | null = null;

  private baseUrl: string;

  public constructor(private readonly options: LlamaCppRuntimeOptions) {
    const host = options.host ?? DEFAULT_HOST;

    const port = options.port ?? DEFAULT_PORT;

    this.baseUrl = `http://${host}:${port}`;
  }

  public supports(model: ModelDefinition): boolean {
    return model.runtime === "llama_cpp";
  }

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

    await this.unload();

    const host = this.options.host ?? DEFAULT_HOST;

    const port = this.options.port ?? DEFAULT_PORT;

    const args: string[] = [
      "--model",
      options.modelPath,

      "--host",
      host,

      "--port",
      String(port),
    ];

    if (options.contextSize !== undefined) {
      args.push("--ctx-size", String(options.contextSize));
    }

    if (options.gpuLayers !== undefined) {
      args.push("--n-gpu-layers", String(options.gpuLayers));
    }

    if (options.threads !== undefined) {
      args.push("--threads", String(options.threads));
    }

    if (options.batchSize !== undefined) {
      args.push("--batch-size", String(options.batchSize));
    }

    this.process = spawn(this.options.executablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process.stdout.on("data", () => {
      // Intentionally consumed.
      // Production logging will be added
      // through Veyra's central logger.
    });

    this.process.stderr.on("data", () => {
      // Intentionally consumed.
    });

    this.process.once("error", (error) => {
      console.error("llama.cpp process error:", error);
    });

    this.process.once("exit", () => {
      this.process = null;
      this.loadedModel = null;
    });

    this.baseUrl = `http://${host}:${port}`;

    await this.waitUntilReady(
      this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      options.signal,
    );

    this.loadedModel = model;
  }

  public async generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    if (!this.loadedModel) {
      throw new Error("No model is currently loaded in llama.cpp.");
    }

    throwIfAborted(options.signal);

    const startedAt = Date.now();

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      signal: options.signal,

      body: JSON.stringify({
        model: this.loadedModel.id,

        messages: [
          {
            role: "user",
            content: options.prompt,
          },
        ],

        stream: false,

        temperature: options.temperature ?? 0.2,

        top_p: options.topP ?? 0.9,

        max_tokens: options.maxTokens ?? 256,
      }),
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `llama.cpp generation failed with HTTP ${response.status}: ${body}`,
      );
    }

    const payload: unknown = await response.json();

    const text = this.extractResponseText(payload);

    const durationMs = Date.now() - startedAt;

    return Object.freeze({
      text,

      durationMs,

      tokensPerSecond: undefined,

      firstTokenMs: undefined,
    });
  }

  public async health(): Promise<ModelRuntimeHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      return Object.freeze({
        ready: response.ok,

        loadedModelId: this.loadedModel?.id ?? null,

        runtimeName: this.name,
      });
    } catch {
      return Object.freeze({
        ready: false,

        loadedModelId: this.loadedModel?.id ?? null,

        runtimeName: this.name,
      });
    }
  }

  public async unload(): Promise<void> {
    const process = this.process;

    this.process = null;
    this.loadedModel = null;

    if (!process) {
      return;
    }

    if (process.exitCode !== null) {
      return;
    }

    process.kill();

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (process.exitCode === null) {
          process.kill("SIGKILL");
        }

        resolve();
      }, 5_000);

      process.once("exit", () => {
        clearTimeout(timeout);

        resolve();
      });
    });
  }

  private async waitUntilReady(
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      throwIfAborted(signal);

      const health = await this.health();

      if (health.ready) {
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 250);
      });
    }

    throw new Error(`llama.cpp did not become ready within ${timeoutMs}ms.`);
  }

  private extractResponseText(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid llama.cpp response.");
    }

    const record = payload as Record<string, unknown>;

    const choices = record.choices;

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error("llama.cpp response did not contain choices.");
    }

    const firstChoice = choices[0];

    if (!firstChoice || typeof firstChoice !== "object") {
      throw new Error("Invalid llama.cpp choice.");
    }

    const message = (firstChoice as Record<string, unknown>).message;

    if (!message || typeof message !== "object") {
      throw new Error("llama.cpp response did not contain a message.");
    }

    const content = (message as Record<string, unknown>).content;

    if (typeof content !== "string") {
      throw new Error("llama.cpp response content was not text.");
    }

    return content;
  }
}