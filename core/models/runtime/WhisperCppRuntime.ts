// core/models/runtime/WhisperCppRuntime.ts

import { spawn } from "node:child_process";

import { promises as fs } from "node:fs";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
  SpeechRecognitionOptions,
  SpeechRecognitionResult,
  SpeechRecognitionRuntime,
} from "./ModelRuntime";

export interface WhisperCppRuntimeOptions {
  readonly executablePath: string;

  readonly defaultThreads?: number;

  readonly processTimeoutMs?: number;
}

const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;

const MIN_PROCESS_TIMEOUT_MS = 5_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class WhisperCppRuntime implements SpeechRecognitionRuntime {
  public readonly name = "whisper_cpp";

  private loadedModel: ModelDefinition | null = null;

  private loadedModelPath: string | null = null;

  private defaultThreads: number;

  private readonly processTimeoutMs: number;

  public constructor(private readonly options: WhisperCppRuntimeOptions) {
    this.defaultThreads = Math.max(1, Math.floor(options.defaultThreads ?? 4));

    this.processTimeoutMs = Math.max(
      MIN_PROCESS_TIMEOUT_MS,
      Math.floor(options.processTimeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS),
    );
  }

  public supports(model: ModelDefinition): boolean {
    return model.runtime === "whisper_cpp";
  }

  public async load(
    model: ModelDefinition,
    options: ModelRuntimeLoadOptions,
  ): Promise<void> {
    if (!this.supports(model)) {
      throw new Error(
        `WhisperCppRuntime cannot execute runtime "${model.runtime}".`,
      );
    }

    throwIfAborted(options.signal);

    const modelPath = options.modelPath.trim();

    if (!modelPath) {
      throw new Error(`A model path is required for "${model.id}".`);
    }

    await fs.access(modelPath);

    this.loadedModel = model;

    this.loadedModelPath = modelPath;

    if (options.threads !== undefined) {
      this.defaultThreads = Math.max(1, Math.floor(options.threads));
    }
  }

  public async transcribe(
    options: SpeechRecognitionOptions,
  ): Promise<SpeechRecognitionResult> {
    if (!this.loadedModel || !this.loadedModelPath) {
      throw new Error("No Whisper model is currently loaded.");
    }

    throwIfAborted(options.signal);

    const audioFilePath = options.audioFilePath.trim();

    if (!audioFilePath) {
      throw new Error("An audio file path is required.");
    }

    await fs.access(audioFilePath);

    const startedAt = Date.now();

    const threads = Math.max(
      1,
      Math.floor(options.threads ?? this.defaultThreads),
    );

    const args: string[] = [
      "--model",
      this.loadedModelPath,

      "--file",
      audioFilePath,

      "--no-timestamps",

      "--threads",
      String(threads),
    ];

    if (options.language?.trim()) {
      args.push("--language", options.language.trim());
    }

    const output = await this.runProcess(args, options.signal);

    const text = this.cleanTranscript(output.stdout);

    return Object.freeze({
      text,

      durationMs: Date.now() - startedAt,

      language: options.language,
    });
  }

  public async health(): Promise<ModelRuntimeHealth> {
    return Object.freeze({
      ready: this.loadedModel !== null && this.loadedModelPath !== null,

      loadedModelId: this.loadedModel?.id ?? null,

      runtimeName: this.name,
    });
  }

  public async unload(): Promise<void> {
    this.loadedModel = null;

    this.loadedModelPath = null;
  }

  private async runProcess(
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<{
    readonly stdout: string;

    readonly stderr: string;
  }> {
    throwIfAborted(signal);

    const child = spawn(this.options.executablePath, [...args], {
      stdio: ["ignore", "pipe", "pipe"],

      windowsHide: true,
    });

    let stdout = "";

    let stderr = "";

    child.stdout.setEncoding("utf8");

    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    let settled = false;

    let timeout: ReturnType<typeof setTimeout> | null = null;

    let abortHandler: (() => void) | null = null;

    const processPromise = new Promise<{
      readonly stdout: string;

      readonly stderr: string;
    }>((resolve, reject) => {
      child.once("error", reject);

      child.once("exit", (code, signalName) => {
        if (code === 0) {
          resolve({
            stdout,
            stderr,
          });

          return;
        }

        reject(
          new Error(
            `whisper.cpp exited with code ${String(code)}${signalName ? ` due to ${signalName}` : ""}: ${stderr.trim() || "no diagnostic output"}`,
          ),
        );
      });
    });

    const abortPromise = new Promise<never>((_resolve, reject) => {
      abortHandler = (): void => {
        if (settled) {
          return;
        }

        try {
          child.kill();
        } catch {
          /*
           * The process may
           * already have exited.
           */
        }

        reject(
          new DOMException("Whisper transcription was aborted.", "AbortError"),
        );
      };

      if (signal) {
        if (signal.aborted) {
          abortHandler();

          return;
        }

        signal.addEventListener("abort", abortHandler, {
          once: true,
        });
      }
    });

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        if (settled) {
          return;
        }

        try {
          child.kill();
        } catch {
          /*
           * Process may already
           * have exited.
           */
        }

        reject(
          new Error(
            `whisper.cpp exceeded the ${this.processTimeoutMs}ms process timeout.`,
          ),
        );
      }, this.processTimeoutMs);
    });

    try {
      const result = await Promise.race([
        processPromise,
        abortPromise,
        timeoutPromise,
      ]);

      settled = true;

      return result;
    } catch (error) {
      settled = true;

      throw new Error(
        `Whisper runtime execution failed: ${getErrorMessage(error)}`,
        {
          cause: error,
        },
      );
    } finally {
      settled = true;

      if (timeout) {
        clearTimeout(timeout);
      }

      if (signal && abortHandler) {
        signal.removeEventListener("abort", abortHandler);
      }

      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill();
        } catch {
          /*
           * Process may already
           * have terminated.
           */
        }
      }
    }
  }

  private cleanTranscript(stdout: string): string {
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith("whisper_"))
      .filter((line) => !line.startsWith("system_info:"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
