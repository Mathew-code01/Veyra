// core/models/runtime/KokoroRuntime.ts

import { promises as fs } from "node:fs";
import path from "node:path";

import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
  SpeechSynthesisOptions,
  SpeechSynthesisResult,
  SpeechSynthesisRuntime,
} from "./ModelRuntime";

export type KokoroDType = "fp32" | "fp16" | "q8" | "q4" | "q4f16";

export interface KokoroRuntimeOptions {
  /**
   * Recommended desktop default.
   */
  readonly dtype?: KokoroDType;

  /**
   * Kokoro CPU execution.
   */
  readonly device?: "cpu";
}

type KokoroGenerateOptions = Parameters<KokoroTTS["generate"]>[1];

type KokoroVoice = NonNullable<KokoroGenerateOptions>["voice"];

const DEFAULT_VOICE = "af_heart";

const DEFAULT_DTYPE: KokoroDType = "q8";

const SAMPLE_RATE = 24_000;

const MAX_TEXT_LENGTH = 4_000;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class KokoroRuntime implements SpeechSynthesisRuntime {
  public readonly name = "kokoro";

  private loadedModel: ModelDefinition | null = null;

  private modelDirectory: string | null = null;

  private tts: KokoroTTS | null = null;

  private readonly configuredDType: KokoroDType;

  private readonly device: "cpu";

  /**
   * Serialize synthesis jobs.
   */
  private generationTail: Promise<void> = Promise.resolve();

  public constructor(options: KokoroRuntimeOptions = {}) {
    this.configuredDType = options.dtype ?? DEFAULT_DTYPE;

    this.device = options.device ?? "cpu";
  }

  /**
   * ==========================================================================
   * Support
   * ==========================================================================
   */

  public supports(model: ModelDefinition): boolean {
    return model.runtime === "kokoro";
  }

  /**
   * ==========================================================================
   * Load
   * ==========================================================================
   */

  public async load(
    model: ModelDefinition,
    options: ModelRuntimeLoadOptions,
  ): Promise<void> {
    if (!this.supports(model)) {
      throw new Error(
        `KokoroRuntime cannot execute runtime "${model.runtime}".`,
      );
    }

    throwIfAborted(options.signal);

    const rawModelPath = options.modelPath.trim();

    if (!rawModelPath) {
      throw new Error(`A model path is required for "${model.id}".`);
    }

    const modelPath = path.resolve(rawModelPath);

    await this.assertReadableFile(
      modelPath,
      `Kokoro model artifact for "${model.id}"`,
    );

    const modelDirectory = await this.resolveModelDirectory(modelPath);

    await this.validateModelDirectory(modelDirectory);

    /*
     * Veyra's package installer owns downloads.
     * Runtime loading therefore remains offline/local-only.
     */
    env.allowLocalModels = true;

    env.allowRemoteModels = false;

    env.useFS = true;

    env.localModelPath = modelDirectory;

    try {
      const tts = await KokoroTTS.from_pretrained(modelDirectory, {
        dtype: this.resolveDType(modelPath),

        device: this.device,
      });

      throwIfAborted(options.signal);

      this.tts = tts;

      this.loadedModel = model;

      this.modelDirectory = modelDirectory;
    } catch (error) {
      this.tts = null;

      this.loadedModel = null;

      this.modelDirectory = null;

      throw new Error(
        `Failed to load Kokoro model "${model.displayName}": ${getErrorMessage(
          error,
        )}`,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * ==========================================================================
   * Synthesis
   * ==========================================================================
   */

  public async synthesize(
    options: SpeechSynthesisOptions,
  ): Promise<SpeechSynthesisResult> {
    const tts = this.requireLoadedRuntime();

    throwIfAborted(options.signal);

    const text = options.text.trim();

    if (!text) {
      throw new Error("Kokoro synthesis text cannot be empty.");
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `Kokoro synthesis text exceeds the ${MAX_TEXT_LENGTH}-character runtime limit.`,
      );
    }

    const rawOutputFilePath = options.outputFilePath.trim();

    if (!rawOutputFilePath) {
      throw new Error("Kokoro outputFilePath cannot be empty.");
    }

    const outputFilePath = path.resolve(rawOutputFilePath);

    const speed = options.speed ?? 1;

    if (!Number.isFinite(speed) || speed <= 0 || speed > 3) {
      throw new Error(
        "Kokoro speed must be greater than 0 and no greater than 3.",
      );
    }

    const requestedVoice = options.voice?.trim() || DEFAULT_VOICE;

    const voice = this.resolveVoice(tts, requestedVoice);

    await fs.mkdir(path.dirname(outputFilePath), {
      recursive: true,
    });

    const startedAt = Date.now();

    let release!: () => void;

    const previous = this.generationTail;

    this.generationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      throwIfAborted(options.signal);

      const generateOptions: KokoroGenerateOptions = {
        voice,
        speed,
      };

      const audio = await tts.generate(text, generateOptions);

      throwIfAborted(options.signal);

      await audio.save(outputFilePath);

      const stat = await fs.stat(outputFilePath);

      if (!stat.isFile() || stat.size <= 44) {
        throw new Error(
          `Kokoro generated an invalid WAV output: ${outputFilePath}`,
        );
      }

      return Object.freeze({
        audioFilePath: outputFilePath,

        durationMs: Date.now() - startedAt,

        sampleRate: SAMPLE_RATE,

        voice: requestedVoice,
      });
    } finally {
      release();
    }
  }

  /**
   * ==========================================================================
   * Health
   * ==========================================================================
   */

  public async health(): Promise<ModelRuntimeHealth> {
    return Object.freeze({
      ready: this.loadedModel !== null && this.tts !== null,

      loadedModelId: this.loadedModel?.id ?? null,

      runtimeName: this.name,
    });
  }

  /**
   * ==========================================================================
   * Unload
   * ==========================================================================
   */

  public async unload(): Promise<void> {
    this.tts = null;

    this.loadedModel = null;

    this.modelDirectory = null;
  }

  /**
   * ==========================================================================
   * Internal
   * ==========================================================================
   */

  private requireLoadedRuntime(): KokoroTTS {
    if (!this.tts || !this.loadedModel) {
      throw new Error("No Kokoro model is currently loaded.");
    }

    return this.tts;
  }

  /**
   * Validate the caller's string against the actual
   * voices supplied by the loaded Kokoro package.
   *
   * This is what fixes the string -> literal-union TS error.
   */
  private resolveVoice(tts: KokoroTTS, requestedVoice: string): KokoroVoice {
    const voices = tts.voices;

    if (!Object.prototype.hasOwnProperty.call(voices, requestedVoice)) {
      const availableVoices = Object.keys(voices).sort();

      throw new Error(
        `Unsupported Kokoro voice "${requestedVoice}". Available voices: ${availableVoices.join(
          ", ",
        )}`,
      );
    }

    return requestedVoice as KokoroVoice;
  }

  private resolveDType(modelPath: string): KokoroDType {
    const filename = path.basename(modelPath).toLowerCase();

    /*
     * Check mixed precision first.
     */
    if (filename.includes("q4f16")) {
      return "q4f16";
    }

    if (filename.includes("q8f16")) {
      return "q8";
    }

    if (
      filename.includes("quantized") ||
      filename.includes("_q8") ||
      filename.includes("q8")
    ) {
      return "q8";
    }

    if (filename.includes("q4")) {
      return "q4";
    }

    if (filename.includes("fp16")) {
      return "fp16";
    }

    return this.configuredDType;
  }

  private async resolveModelDirectory(modelPath: string): Promise<string> {
    const candidates: string[] = [];

    let current = path.dirname(modelPath);

    /*
     * Expected layout:
     *
     * root/
     * ├── config.json
     * ├── tokenizer.json
     * ├── tokenizer_config.json
     * ├── onnx/
     * │   └── model_*.onnx
     * └── voices/
     *     └── *.bin
     */

    for (let i = 0; i < 5; i += 1) {
      candidates.push(current);

      const parent = path.dirname(current);

      if (parent === current) {
        break;
      }

      current = parent;
    }

    for (const candidate of candidates) {
      const configPath = path.join(candidate, "config.json");

      const tokenizerPath = path.join(candidate, "tokenizer.json");

      const voicesPath = path.join(candidate, "voices");

      if (
        (await this.exists(configPath)) &&
        (await this.exists(tokenizerPath)) &&
        (await this.exists(voicesPath))
      ) {
        return candidate;
      }
    }

    throw new Error(
      `Unable to locate the Kokoro model root for "${modelPath}". Expected config.json, tokenizer.json and voices/.`,
    );
  }

  private async validateModelDirectory(directory: string): Promise<void> {
    const requiredFiles = [
      "config.json",

      "tokenizer.json",

      "tokenizer_config.json",
    ];

    for (const filename of requiredFiles) {
      const filePath = path.join(directory, filename);

      await this.assertReadableFile(filePath, `Kokoro ${filename}`);
    }

    const voicesDirectory = path.join(directory, "voices");

    const voicesStat = await fs.stat(voicesDirectory);

    if (!voicesStat.isDirectory()) {
      throw new Error(
        `Kokoro voices path is not a directory: ${voicesDirectory}`,
      );
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);

      return true;
    } catch {
      return false;
    }
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
