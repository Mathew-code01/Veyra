// core/models/runtime/WhisperCppRuntime.ts

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
  RealtimeSpeechRecognitionOptions,
  RealtimeSpeechRecognitionRuntime,
  SpeechRecognitionRealtimeSession,
  SpeechRecognitionResult,
} from "./ModelRuntime";

export interface WhisperCppRuntimeOptions {
  /**
   * whisper-cli / main executable.
   */
  readonly executablePath: string;

  /**
   * Optional whisper-stream executable.
   *
   * When omitted, the runtime derives:
   *
   * whisper-cli.exe -> whisper-stream.exe
   */
  readonly realtimeExecutablePath?: string;

  readonly startupTimeoutMs?: number;

  readonly shutdownTimeoutMs?: number;

  readonly defaultThreads?: number;

  readonly defaultStepMs?: number;

  readonly defaultLengthMs?: number;

  readonly defaultVadThreshold?: number;
}

type WhisperProcess = ChildProcessByStdio<null, Readable, Readable>;

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000;

const DEFAULT_THREADS = 4;

const DEFAULT_STEP_MS = 500;

const DEFAULT_LENGTH_MS = 5_000;

const DEFAULT_VAD_THRESHOLD = 0.6;

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

function normalizeTranscript(value: string): string {
  return value.replace(/\r/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Merge overlapping Whisper sliding-window text without repeatedly
 * duplicating the same words.
 */
function mergeTranscript(previous: string, next: string): string {
  const a = normalizeTranscript(previous);

  const b = normalizeTranscript(next);

  if (!a) {
    return b;
  }

  if (!b) {
    return a;
  }

  if (b === a) {
    return a;
  }

  if (b.includes(a)) {
    return b;
  }

  if (a.includes(b)) {
    return a;
  }

  const maxOverlap = Math.min(a.length, b.length);

  for (let length = maxOverlap; length >= 8; length -= 1) {
    const suffix = a.slice(-length);

    const prefix = b.slice(0, length);

    if (suffix.toLowerCase() === prefix.toLowerCase()) {
      return normalizeTranscript(`${a} ${b.slice(length)}`);
    }
  }

  return normalizeTranscript(`${a} ${b}`);
}

export class WhisperCppRuntime implements RealtimeSpeechRecognitionRuntime {
  public readonly name = "whisper_cpp";

  private loadedModel: ModelDefinition | null = null;

  private loadedModelPath: string | null = null;

  private realtimeProcess: WhisperProcess | null = null;

  private readonly executablePath: string;

  private readonly realtimeExecutablePath: string;

  private readonly startupTimeoutMs: number;

  private readonly shutdownTimeoutMs: number;

  private readonly defaultThreads: number;

  private readonly defaultStepMs: number;

  private readonly defaultLengthMs: number;

  private readonly defaultVadThreshold: number;

  public constructor(options: WhisperCppRuntimeOptions) {
    const executablePath = options.executablePath.trim();

    if (!executablePath) {
      throw new Error("WhisperCppRuntime requires an executablePath.");
    }

    this.executablePath = executablePath;

    this.realtimeExecutablePath =
      options.realtimeExecutablePath?.trim() ||
      this.deriveRealtimeExecutable(executablePath);

    this.startupTimeoutMs = Math.max(
      1_000,
      Math.floor(options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS),
    );

    this.shutdownTimeoutMs = Math.max(
      1_000,
      Math.floor(options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS),
    );

    this.defaultThreads = Math.max(
      1,
      Math.floor(options.defaultThreads ?? DEFAULT_THREADS),
    );

    this.defaultStepMs = Math.max(
      100,
      Math.floor(options.defaultStepMs ?? DEFAULT_STEP_MS),
    );

    this.defaultLengthMs = Math.max(
      1_000,
      Math.floor(options.defaultLengthMs ?? DEFAULT_LENGTH_MS),
    );

    this.defaultVadThreshold = Math.min(
      1,
      Math.max(0, options.defaultVadThreshold ?? DEFAULT_VAD_THRESHOLD),
    );
  }

  /**
   * ==========================================================================
   * Model support
   * ==========================================================================
   */

  public supports(model: ModelDefinition): boolean {
    return model.runtime === "whisper_cpp";
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
        `WhisperCppRuntime cannot execute runtime "${model.runtime}".`,
      );
    }

    throwIfAborted(options.signal);

    const rawModelPath = options.modelPath.trim();

    if (!rawModelPath) {
      throw new Error(`A model path is required for "${model.id}".`);
    }

    const modelPath = path.resolve(rawModelPath);

    await this.assertReadableFile(modelPath, `Whisper model for "${model.id}"`);

    await this.stopRealtimeProcess();

    this.loadedModel = model;

    this.loadedModelPath = modelPath;
  }

  /**
   * ==========================================================================
   * Batch transcription
   * ==========================================================================
   */

  public async transcribe(options: {
    readonly audioFilePath: string;
    readonly language?: string;
    readonly threads?: number;
    readonly signal?: AbortSignal;
  }): Promise<SpeechRecognitionResult> {
    const modelPath = this.requireLoadedModelPath();

    throwIfAborted(options.signal);

    const rawAudioPath = options.audioFilePath.trim();

    if (!rawAudioPath) {
      throw new Error("Whisper audioFilePath cannot be empty.");
    }

    const audioPath = path.resolve(rawAudioPath);

    await this.assertReadableFile(audioPath, "Whisper audio input");

    const startedAt = Date.now();

    const threads = Math.max(
      1,
      Math.floor(options.threads ?? this.defaultThreads),
    );

    const args: string[] = [
      "--model",
      modelPath,

      "--file",
      audioPath,

      "--no-timestamps",

      "--threads",
      String(threads),
    ];

    if (options.language?.trim()) {
      args.push("--language", options.language.trim());
    }

    const child = spawn(this.executablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],

      windowsHide: process.platform === "win32",
    });

    child.stdout.setEncoding("utf8");

    child.stderr.setEncoding("utf8");

    let stdout = "";

    let stderr = "";

    child.stdout.on("data", (chunk: string) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += String(chunk);
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (error?: Error): void => {
        if (settled) {
          return;
        }

        settled = true;

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      child.once("error", (error) => {
        finish(error);
      });

      child.once("exit", (code, signal) => {
        if (code === 0) {
          finish();

          return;
        }

        finish(
          new Error(
            `whisper.cpp exited with code ${String(code)}${
              signal ? ` due to ${signal}` : ""
            }: ${stderr.trim() || "no diagnostic output"}`,
          ),
        );
      });
    });

    throwIfAborted(options.signal);

    return Object.freeze({
      text: normalizeTranscript(stdout),

      durationMs: Date.now() - startedAt,

      language: options.language,
    });
  }

  /**
   * ==========================================================================
   * TRUE REALTIME
   * ==========================================================================
   */

  public async startRealtime(
    options: RealtimeSpeechRecognitionOptions,
  ): Promise<SpeechRecognitionRealtimeSession> {
    this.requireLoadedModel();

    const modelPath = this.requireLoadedModelPath();

    throwIfAborted(options.signal);

    if (this.realtimeProcess) {
      throw new Error("A Whisper realtime session is already running.");
    }

    const threads = Math.max(
      1,
      Math.floor(options.threads ?? this.defaultThreads),
    );

    const stepMs = Math.max(
      100,
      Math.floor(options.stepMs ?? this.defaultStepMs),
    );

    const lengthMs = Math.max(
      1_000,
      Math.floor(options.lengthMs ?? this.defaultLengthMs),
    );

    const vadThreshold = Math.min(
      1,
      Math.max(0, options.vadThreshold ?? this.defaultVadThreshold),
    );

    const args: string[] = [
      "--model",
      modelPath,

      "--threads",
      String(threads),

      "--step",
      String(stepMs),

      "--length",
      String(lengthMs),

      "--vad-thold",
      String(vadThreshold),
    ];

    if (options.language?.trim()) {
      args.push("--language", options.language.trim());
    }

    const child = spawn(this.realtimeExecutablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],

      windowsHide: process.platform === "win32",
    });

    child.stdout.setEncoding("utf8");

    child.stderr.setEncoding("utf8");

    this.realtimeProcess = child;

    let outputBuffer = "";

    let combinedTranscript = "";

    let lastPartial = "";

    let stopped = false;

    let processError: Error | null = null;

    const emitPartial = (text: string): void => {
      const partial = normalizeTranscript(text);

      if (!partial || partial === lastPartial) {
        return;
      }

      lastPartial = partial;

      try {
        options.onPartial(partial);
      } catch {
        /*
         * Consumer callback errors must never
         * terminate the transcription process.
         */
      }
    };

    const consumeLine = (line: string): void => {
      const parsed = this.parseRealtimeLine(line);

      if (!parsed) {
        return;
      }

      const merged = mergeTranscript(combinedTranscript, parsed);

      if (merged === combinedTranscript) {
        return;
      }

      combinedTranscript = merged;

      emitPartial(combinedTranscript);
    };

    child.stdout.on("data", (chunk: string) => {
      outputBuffer += String(chunk);

      const lines = outputBuffer.split(/\r?\n/);

      outputBuffer = lines.pop() ?? "";

      for (const line of lines) {
        consumeLine(line);
      }
    });

    child.stderr.on("data", (chunk: string) => {
      const text = String(chunk).trim();

      if (!text) {
        return;
      }

      const lowered = text.toLowerCase();

      if (
        lowered.includes("error") ||
        lowered.includes("failed") ||
        lowered.includes("fatal")
      ) {
        processError = new Error(text);

        try {
          options.onError?.(processError);
        } catch {
          /*
           * Consumer callback failure
           * must not propagate.
           */
        }
      }
    });

    child.once("error", (error) => {
      processError = error;

      if (!stopped) {
        try {
          options.onError?.(error);
        } catch {
          // Ignore callback failure.
        }
      }
    });

    child.once("exit", (code, signal) => {
      if (code !== 0 && !stopped && processError === null) {
        processError = new Error(
          `whisper-stream exited with code ${String(code)}${
            signal ? ` due to ${signal}` : ""
          }.`,
        );

        try {
          options.onError?.(processError);
        } catch {
          // Ignore callback failure.
        }
      }
    });

    /*
     * Short startup check.
     *
     * We intentionally do not block until speech is detected.
     */
    const startupDeadline = Date.now() + Math.min(this.startupTimeoutMs, 2_000);

    while (Date.now() < startupDeadline) {
      throwIfAborted(options.signal);

      if (processError) {
        await this.stopRealtimeProcess();

        throw processError;
      }

      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("whisper-stream exited during startup.");
      }

      await sleep(50);

      break;
    }

    const stop = async (): Promise<SpeechRecognitionResult> => {
      if (stopped) {
        return Object.freeze({
          text: normalizeTranscript(combinedTranscript),

          durationMs: 0,

          language: options.language,
        });
      }

      stopped = true;

      const startedAt = Date.now();

      await this.stopProcess(child);

      if (outputBuffer.trim()) {
        consumeLine(outputBuffer);
      }

      const finalText = normalizeTranscript(combinedTranscript);

      try {
        options.onFinal?.(finalText);
      } catch {
        // Ignore consumer callback failure.
      }

      return Object.freeze({
        text: finalText,

        durationMs: Math.max(0, Date.now() - startedAt),

        language: options.language,
      });
    };

    if (options.signal) {
      if (options.signal.aborted) {
        await stop();

        throw new DOMException("Operation was aborted.", "AbortError");
      }

      options.signal.addEventListener(
        "abort",
        () => {
          void stop();
        },
        {
          once: true,
        },
      );
    }

    return Object.freeze({
      get stopped(): boolean {
        return stopped;
      },

      stop,
    });
  }

  /**
   * ==========================================================================
   * Health
   * ==========================================================================
   */

  public async health(): Promise<ModelRuntimeHealth> {
    const model = this.loadedModel;

    return Object.freeze({
      ready: model !== null && this.loadedModelPath !== null,

      loadedModelId: model?.id ?? null,

      runtimeName: this.name,
    });
  }

  /**
   * ==========================================================================
   * Unload
   * ==========================================================================
   */

  public async unload(): Promise<void> {
    await this.stopRealtimeProcess();

    this.loadedModel = null;

    this.loadedModelPath = null;
  }

  /**
   * ==========================================================================
   * Internal
   * ==========================================================================
   */

  private requireLoadedModel(): ModelDefinition {
    if (!this.loadedModel) {
      throw new Error("No Whisper model is currently loaded.");
    }

    return this.loadedModel;
  }

  private requireLoadedModelPath(): string {
    if (!this.loadedModelPath) {
      throw new Error("No Whisper model artifact is currently loaded.");
    }

    return this.loadedModelPath;
  }

  private parseRealtimeLine(line: string): string | null {
    let value = line.replace(/\r/g, "").trim();

    if (!value) {
      return null;
    }

    /*
     * Remove common timestamps:
     *
     * [00:00:01.000 --> 00:00:02.500]
     */
    value = value.replace(/^\[[^\]]+\]\s*/, "");

    /*
     * Remove common logging prefixes.
     */
    value = value.replace(
      /^(?:whisper_|system_info|main:|stream:)[^:]*:\s*/i,
      "",
    );

    /*
     * Ignore known diagnostic output.
     */
    if (
      !value ||
      value.startsWith("whisper_") ||
      value.startsWith("ggml_") ||
      value.startsWith("system_info") ||
      value.startsWith("main:")
    ) {
      return null;
    }

    return normalizeTranscript(value);
  }

  private async stopRealtimeProcess(): Promise<void> {
    const child = this.realtimeProcess;

    this.realtimeProcess = null;

    if (!child) {
      return;
    }

    await this.stopProcess(child);
  }

  private async stopProcess(child: WhisperProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    try {
      child.kill();
    } catch {
      // Already stopped.
    }

    await new Promise<void>((resolve) => {
      let settled = false;

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;

        clearTimeout(timeout);

        resolve();
      };

      const timeout = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Already stopped.
          }
        }

        finish();
      }, this.shutdownTimeoutMs);

      child.once("exit", finish);
    });
  }

  private deriveRealtimeExecutable(executablePath: string): string {
    const directory = path.dirname(executablePath);

    const extension = path.extname(executablePath);

    return path.join(directory, `whisper-stream${extension}`);
  }

  private async assertReadableFile(
    filePath: string,
    label: string,
  ): Promise<void> {
    try {
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) {
        throw new Error(`${label} is not a regular file.`);
      }

      await fs.access(filePath);
    } catch (error) {
      throw new Error(`${label} is not accessible: ${filePath}`, {
        cause: error,
      });
    }
  }
}
