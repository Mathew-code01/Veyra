// core/audio/LocalWhisperProvider.ts

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ModelManager } from "../models/ModelManager";

import type {
  PartialTranscription,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./TranscriptionEngine";

export interface LocalWhisperProviderOptions {
  readonly modelManager: ModelManager;

  /**
   * Optional Whisper model to use.
   *
   * The model is resolved through ModelManager.
   * It is NOT passed directly into SpeechRecognitionOptions.
   */
  readonly modelId?: string;

  readonly language?: string;

  readonly prompt?: string;

  readonly threads?: number;

  readonly tempDirectory?: string;
}

export class LocalWhisperProvider implements TranscriptionProvider {
  public readonly name = "local-whisper";

  private readonly modelManager: ModelManager;

  private readonly modelId?: string;

  private readonly defaultLanguage?: string;

  private readonly defaultPrompt?: string;

  private readonly threads?: number;

  private readonly tempDirectory: string;

  public constructor(options: LocalWhisperProviderOptions) {
    this.modelManager = options.modelManager;

    this.modelId = options.modelId?.trim() || undefined;

    this.defaultLanguage = options.language?.trim() || undefined;

    this.defaultPrompt = options.prompt?.trim() || undefined;

    this.threads =
      options.threads != null
        ? Math.max(1, Math.floor(options.threads))
        : undefined;

    this.tempDirectory = path.resolve(
      options.tempDirectory?.trim() || path.join(os.tmpdir(), "veyra-audio"),
    );
  }

  /**
   * ==========================================================================
   * Batch transcription
   * ==========================================================================
   *
   * Flow:
   *
   * LocalWhisperProvider
   *        ↓
   * ModelManager
   *        ↓
   * ModelRuntimeManager
   *        ↓
   * WhisperCppRuntime
   *        ↓
   * whisper.cpp
   */
  public async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    if (request.audio.byteLength === 0) {
      throw new Error("Local Whisper cannot transcribe empty audio.");
    }

    this.throwIfAborted(request.signal);

    /*
     * Make sure the correct Whisper model is loaded before
     * calling ModelManager.transcribe().
     *
     * SpeechRecognitionOptions intentionally does not contain
     * modelId. Model selection belongs to ModelManager/runtime.
     */
    const activeModel = await this.ensureWhisperModelReady(request.signal);

    this.throwIfAborted(request.signal);

    const temporaryFile = await this.createTemporaryAudioFile(request);

    try {
      this.throwIfAborted(request.signal);

      /*
       * IMPORTANT:
       *
       * Do NOT pass modelId here.
       *
       * ModelManager.transcribe() accepts SpeechRecognitionOptions,
       * whose model selection is represented by the currently loaded
       * runtime/model rather than a modelId property.
       */
      const result = await this.modelManager.transcribe({
        audioFilePath: temporaryFile.path,

        language: request.language?.trim() || this.defaultLanguage,

        threads: this.threads,

        signal: request.signal,
      });

      this.throwIfAborted(request.signal);

      return Object.freeze({
        text: result.text,

        language:
          result.language || request.language?.trim() || this.defaultLanguage,

        durationMs: result.durationMs,

        provider: this.name,

        /*
         * SpeechRecognitionResult does not expose `model`.
         *
         * The model identity is therefore taken from the model
         * that ModelManager confirmed as active.
         */
        model: activeModel.id,
      });
    } finally {
      await this.removeTemporaryFile(temporaryFile.path);
    }
  }

  /**
   * ==========================================================================
   * Stream transcription
   * ==========================================================================
   *
   * Local Whisper batch transcription produces one final result.
   *
   * True microphone realtime transcription should use:
   *
   * ModelManager.startRealtimeTranscription()
   *
   * rather than pretending that batch transcription is realtime.
   */
  public async transcribeStream(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult> {
    if (typeof onPartial !== "function") {
      throw new Error("LocalWhisperProvider requires an onPartial callback.");
    }

    const result = await this.transcribe(request);

    onPartial({
      text: result.text,

      timestamp: Date.now(),

      isFinal: true,

      confidence: result.confidence,
    });

    return result;
  }

  /**
   * ==========================================================================
   * Whisper model readiness
   * ==========================================================================
   *
   * If a modelId was configured:
   *
   *   1. Verify the model exists.
   *   2. Verify the model is compatible with the Whisper runtime.
   *   3. If it is already loaded, use it.
   *   4. If another model is loaded, switch to the configured model.
   *   5. If the configured model is not installed, fail with a clear error.
   *
   * If no modelId was configured:
   *
   *   1. Use the currently loaded model.
   *   2. Verify that it is a Whisper model.
   *
   * This keeps installation separate from transcription.
   */
  private async ensureWhisperModelReady(signal?: AbortSignal): Promise<{
    readonly id: string;
  }> {
    this.throwIfAborted(signal);

    const configuredModelId = this.modelId;

    /*
     * ------------------------------------------------------------------------
     * Explicit model selection
     * ------------------------------------------------------------------------
     */
    if (configuredModelId) {
      const model = this.modelManager.getModel(configuredModelId);

      if (model.runtime !== "whisper_cpp") {
        throw new Error(
          `Model "${configuredModelId}" is not a Whisper model. ` +
            `LocalWhisperProvider requires a model using the "whisper_cpp" runtime.`,
        );
      }

      if (!this.modelManager.supportsModel(configuredModelId)) {
        throw new Error(
          `The Whisper runtime does not support model "${configuredModelId}". ` +
            `Make sure WhisperCppRuntime is registered with ModelManager.`,
        );
      }

      this.throwIfAborted(signal);

      const loadedModel = this.modelManager.getLoadedModel();

      /*
       * The requested Whisper model is already active.
       */
      if (loadedModel?.id === configuredModelId) {
        return {
          id: configuredModelId,
        };
      }

      /*
       * Do not silently download a large Whisper model during
       * transcription.
       *
       * Installation should be performed by the model installation
       * layer before the provider attempts to load the model.
       */
      if (!this.modelManager.isInstalled(configuredModelId)) {
        throw new Error(
          `Whisper model "${configuredModelId}" is not installed. ` +
            `Install the model through ModelManager before transcription.`,
        );
      }

      this.throwIfAborted(signal);

      /*
       * The model is installed but not currently loaded.
       *
       * ModelManager owns the runtime lifecycle.
       */
      await this.modelManager.loadModel(configuredModelId, {
        threads: this.threads,

        signal,
      });

      this.throwIfAborted(signal);

      const activeModel = this.modelManager.getLoadedModel();

      if (activeModel?.id !== configuredModelId) {
        throw new Error(
          `Whisper model "${configuredModelId}" failed to become the active model.`,
        );
      }

      return {
        id: configuredModelId,
      };
    }

    /*
     * ------------------------------------------------------------------------
     * No explicit model selection
     * ------------------------------------------------------------------------
     *
     * In this mode ModelManager must already have a Whisper model loaded.
     */
    const loadedModel = this.modelManager.getLoadedModel();

    if (!loadedModel) {
      throw new Error(
        "No Whisper model is loaded. Configure a Whisper modelId " +
          "or load a Whisper model through ModelManager first.",
      );
    }

    if (loadedModel.runtime !== "whisper_cpp") {
      throw new Error(
        `The currently loaded model "${loadedModel.id}" is not a Whisper model. ` +
          `LocalWhisperProvider requires an active "whisper_cpp" model.`,
      );
    }

    if (!this.modelManager.supportsModel(loadedModel.id)) {
      throw new Error(
        `The Whisper runtime does not support the active model "${loadedModel.id}".`,
      );
    }

    return {
      id: loadedModel.id,
    };
  }

  /**
   * ==========================================================================
   * Temporary audio preparation
   * ==========================================================================
   */

  private async createTemporaryAudioFile(
    request: TranscriptionRequest,
  ): Promise<{
    readonly path: string;
  }> {
    await fs.mkdir(this.tempDirectory, {
      recursive: true,
    });

    const extension = this.resolveAudioExtension(request);

    const filePath = path.join(
      this.tempDirectory,
      `veyra-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
    );

    const format = request.format;

    /*
     * Captured PCM must be wrapped in
     * a real WAV container.
     */
    if (format && format.sampleFormat === "pcm_s16le") {
      const wav = this.createPcm16Wav(
        request.audio,
        format.sampleRate,
        format.channels,
      );

      await fs.writeFile(filePath, wav);

      return {
        path: filePath,
      };
    }

    /*
     * Float PCM is converted to
     * signed 16-bit PCM before being
     * wrapped in WAV.
     */
    if (format && format.sampleFormat === "pcm_f32le") {
      const pcm16 = this.convertFloat32ToPcm16(request.audio);

      const wav = this.createPcm16Wav(
        pcm16,
        format.sampleRate,
        format.channels,
      );

      await fs.writeFile(filePath, wav);

      return {
        path: filePath,
      };
    }

    /*
     * Existing WAV can be passed directly.
     */
    if (
      format?.sampleFormat === "wav" ||
      this.isWavMimeType(request.mimeType)
    ) {
      await fs.writeFile(filePath, request.audio);

      return {
        path: filePath,
      };
    }

    /*
     * Other encoded formats can be passed
     * to whisper.cpp when the installed
     * whisper.cpp build supports them.
     */
    await fs.writeFile(filePath, request.audio);

    return {
      path: filePath,
    };
  }

  /**
   * ==========================================================================
   * WAV encoder
   * ==========================================================================
   */

  private createPcm16Wav(
    pcm: Uint8Array,
    sampleRate: number,
    channels: number,
  ): Uint8Array {
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error("Invalid PCM sample rate.");
    }

    if (!Number.isInteger(channels) || channels <= 0) {
      throw new Error("Invalid PCM channel count.");
    }

    if (pcm.byteLength % 2 !== 0) {
      throw new Error("PCM s16le audio must contain an even number of bytes.");
    }

    const bytesPerSample = 2;

    const blockAlign = channels * bytesPerSample;

    const byteRate = sampleRate * blockAlign;

    const dataSize = pcm.byteLength;

    const buffer = new ArrayBuffer(44 + dataSize);

    const view = new DataView(buffer);

    const output = new Uint8Array(buffer);

    this.writeAscii(output, 0, "RIFF");

    view.setUint32(4, 36 + dataSize, true);

    this.writeAscii(output, 8, "WAVE");

    this.writeAscii(output, 12, "fmt ");

    view.setUint32(16, 16, true);

    view.setUint16(20, 1, true);

    view.setUint16(22, channels, true);

    view.setUint32(24, sampleRate, true);

    view.setUint32(28, byteRate, true);

    view.setUint16(32, blockAlign, true);

    view.setUint16(34, 16, true);

    this.writeAscii(output, 36, "data");

    view.setUint32(40, dataSize, true);

    output.set(pcm, 44);

    return output;
  }

  /**
   * ==========================================================================
   * Float32 PCM → signed 16-bit PCM
   * ==========================================================================
   */

  private convertFloat32ToPcm16(input: Uint8Array): Uint8Array {
    if (input.byteLength % 4 !== 0) {
      throw new Error("PCM f32le audio must contain a multiple of 4 bytes.");
    }

    const inputBuffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    );

    const floatView = new Float32Array(inputBuffer);

    const output = new Int16Array(floatView.length);

    for (let index = 0; index < floatView.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, floatView[index] ?? 0));

      output[index] =
        sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    }

    return new Uint8Array(output.buffer);
  }

  /**
   * ==========================================================================
   * Helpers
   * ==========================================================================
   */

  private resolveAudioExtension(request: TranscriptionRequest): string {
    if (
      request.format?.sampleFormat === "pcm_s16le" ||
      request.format?.sampleFormat === "pcm_f32le" ||
      request.format?.sampleFormat === "wav"
    ) {
      return ".wav";
    }

    const mimeType = request.mimeType?.trim().toLowerCase();

    switch (mimeType) {
      case "audio/webm":
        return ".webm";

      case "audio/ogg":
        return ".ogg";

      case "audio/opus":
        return ".opus";

      case "audio/mpeg":
      case "audio/mp3":
        return ".mp3";

      case "audio/mp4":
      case "audio/m4a":
      case "audio/x-m4a":
        return ".m4a";

      case "audio/wav":
      case "audio/x-wav":
      case "audio/wave":
      default:
        return ".wav";
    }
  }

  private isWavMimeType(mimeType?: string): boolean {
    const normalized = mimeType?.trim().toLowerCase();

    return (
      normalized === "audio/wav" ||
      normalized === "audio/x-wav" ||
      normalized === "audio/wave"
    );
  }

  private writeAscii(target: Uint8Array, offset: number, value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      target[offset + index] = value.charCodeAt(index);
    }
  }

  private async removeTemporaryFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      /*
       * Cleanup failures must never
       * replace the transcription error.
       */
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException(
        "Local Whisper transcription was aborted.",
        "AbortError",
      );
    }
  }
}
