// core/models/runtime/LlamaCppRuntime.ts

import { spawn, type ChildProcessByStdio } from "node:child_process";

import type { Readable } from "node:stream";

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

  readonly healthPollIntervalMs?: number;
}

type LlamaCppProcess = ChildProcessByStdio<null, Readable, Readable>;

const DEFAULT_HOST = "127.0.0.1";

const DEFAULT_PORT = 39271;

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;

const DEFAULT_HEALTH_POLL_INTERVAL_MS = 250;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class LlamaCppRuntime implements ModelRuntime {
  public readonly name = "llama_cpp";

  private process: LlamaCppProcess | null = null;

  private loadedModel: ModelDefinition | null = null;

  private baseUrl: string;

  private lastProcessError: Error | null = null;

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

    if (!options.modelPath.trim()) {
      throw new Error(`A model path is required for "${model.id}".`);
    }

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

    this.lastProcessError = null;

    const child = spawn(this.options.executablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process = child;

    child.stdout.on("data", () => {
      /*
       * stdout is deliberately consumed.
       *
       * Runtime logging will eventually be
       * routed through Veyra's central logger.
       */
    });

    child.stderr.on("data", () => {
      /*
       * stderr is deliberately consumed.
       *
       * Runtime logging will eventually be
       * routed through Veyra's central logger.
       */
    });

    child.once("error", (error) => {
      this.lastProcessError = error;

      if (this.process === child) {
        this.process = null;
        this.loadedModel = null;
      }
    });

    child.once("exit", () => {
      if (this.process === child) {
        this.process = null;
        this.loadedModel = null;
      }
    });

    this.baseUrl = `http://${host}:${port}`;

    try {
      await this.waitUntilReady(
        this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
        options.signal,
      );
    } catch (error) {
      await this.unload();

      if (this.lastProcessError) {
        throw new Error(
          `Failed to start llama.cpp: ${this.lastProcessError.message}`,
        );
      }

      throw error;
    }

    throwIfAborted(options.signal);

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

        stream: typeof options.onToken === "function",

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

    if (typeof options.onToken === "function") {
      return this.consumeStreamingResponse(response, startedAt, options);
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
    const child = this.process;

    this.process = null;
    this.loadedModel = null;

    if (!child) {
      return;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    child.kill();

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Process may already have exited.
          }
        }

        resolve();
      }, 5_000);

      child.once("exit", () => {
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

    const interval =
      this.options.healthPollIntervalMs ?? DEFAULT_HEALTH_POLL_INTERVAL_MS;

    while (Date.now() - startedAt < timeoutMs) {
      throwIfAborted(signal);

      if (this.lastProcessError) {
        throw this.lastProcessError;
      }

      if (!this.process || this.process.exitCode !== null) {
        throw new Error("llama.cpp process exited before becoming ready.");
      }

      const health = await this.health();

      if (health.ready) {
        return;
      }

      await sleep(interval);
    }

    throw new Error(`llama.cpp did not become ready within ${timeoutMs}ms.`);
  }

  private async consumeStreamingResponse(
    response: Response,
    startedAt: number,
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    if (!response.body) {
      throw new Error("llama.cpp returned an empty streaming response.");
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";

    let text = "";

    let firstTokenMs: number | undefined;

    try {
      while (true) {
        throwIfAborted(options.signal);

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");

        buffer = events.pop() ?? "";

        for (const event of events) {
          const token = this.extractStreamingToken(event);

          if (!token) {
            continue;
          }

          if (firstTokenMs === undefined) {
            firstTokenMs = Date.now() - startedAt;
          }

          text += token;

          options.onToken?.(token);
        }
      }

      buffer += decoder.decode();

      const finalToken = this.extractStreamingToken(buffer);

      if (finalToken) {
        if (firstTokenMs === undefined) {
          firstTokenMs = Date.now() - startedAt;
        }

        text += finalToken;

        options.onToken?.(finalToken);
      }
    } finally {
      reader.releaseLock();
    }

    const durationMs = Date.now() - startedAt;

    return Object.freeze({
      text,

      durationMs,

      firstTokenMs,

      tokensPerSecond: undefined,
    });
  }

  private extractStreamingToken(event: string): string | null {
    const lines = event.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();

      if (!data || data === "[DONE]") {
        continue;
      }

      try {
        const payload: unknown = JSON.parse(data);

        if (!payload || typeof payload !== "object") {
          continue;
        }

        const choices = (payload as Record<string, unknown>).choices;

        if (!Array.isArray(choices) || choices.length === 0) {
          continue;
        }

        const choice = choices[0];

        if (!choice || typeof choice !== "object") {
          continue;
        }

        const delta = (choice as Record<string, unknown>).delta;

        if (!delta || typeof delta !== "object") {
          continue;
        }

        const content = (delta as Record<string, unknown>).content;

        if (typeof content === "string") {
          return content;
        }
      } catch {
        /*
         * Ignore malformed SSE
         * fragments rather than
         * crashing the runtime.
         */
      }
    }

    return null;
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
