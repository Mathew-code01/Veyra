// core/audio/AudioTranscriptionService.ts

import type { AudioBuffer, AudioBufferStats } from "./AudioBuffer";

import type {
  PartialTranscription,
  TranscriptionEngine,
  TranscriptionResult,
} from "./TranscriptionEngine";

export interface AudioTranscriptionOptions {
  readonly language?: string;

  readonly prompt?: string;

  readonly signal?: AbortSignal;
}

export interface AudioTranscriptionServiceResult extends TranscriptionResult {
  readonly audioStats: AudioBufferStats;
}

/**
 * High-level audio transcription service.
 *
 * This class connects:
 *
 * AudioBuffer
 *      ↓
 * TranscriptionEngine
 *      ↓
 * LocalWhisperProvider / WhisperEngine
 */
export class AudioTranscriptionService {
  private readonly engine: TranscriptionEngine;

  public constructor(engine: TranscriptionEngine) {
    this.engine = engine;
  }

  public async transcribe(
    audioBuffer: AudioBuffer,
    options: AudioTranscriptionOptions = {},
  ): Promise<AudioTranscriptionServiceResult> {
    const stats = audioBuffer.getStats();

    if (stats.byteLength <= 0) {
      throw new Error("Cannot transcribe an empty AudioBuffer.");
    }

    const chunks = audioBuffer.getChunks();

    const firstChunk = chunks[0];

    const audio = audioBuffer.toUint8Array();

    const result = await this.engine.transcribe({
      audio,

      mimeType: this.resolveMimeType(firstChunk?.format.sampleFormat),

      format: firstChunk?.format
        ? {
            sampleRate: firstChunk.format.sampleRate,

            channels: firstChunk.format.channels,

            sampleFormat: firstChunk.format.sampleFormat,

            bitDepth: firstChunk.format.bitDepth,
          }
        : undefined,

      language: options.language,

      prompt: options.prompt,

      timestamp: firstChunk?.timestamp,

      signal: options.signal,
    });

    return Object.freeze({
      ...result,

      audioStats: stats,
    });
  }

  public async transcribeStream(
    audioBuffer: AudioBuffer,
    onPartial: (partial: PartialTranscription) => void,
    options: AudioTranscriptionOptions = {},
  ): Promise<AudioTranscriptionServiceResult> {
    const stats = audioBuffer.getStats();

    if (stats.byteLength <= 0) {
      throw new Error("Cannot transcribe an empty AudioBuffer.");
    }

    const chunks = audioBuffer.getChunks();

    const firstChunk = chunks[0];

    const result = await this.engine.transcribeStream(
      {
        audio: audioBuffer.toUint8Array(),

        mimeType: this.resolveMimeType(firstChunk?.format.sampleFormat),

        format: firstChunk?.format
          ? {
              sampleRate: firstChunk.format.sampleRate,

              channels: firstChunk.format.channels,

              sampleFormat: firstChunk.format.sampleFormat,

              bitDepth: firstChunk.format.bitDepth,
            }
          : undefined,

        language: options.language,

        prompt: options.prompt,

        timestamp: firstChunk?.timestamp,

        signal: options.signal,
      },
      onPartial,
    );

    return Object.freeze({
      ...result,

      audioStats: stats,
    });
  }

  public getProviderName(): string {
    return this.engine.getProviderName();
  }

  private resolveMimeType(
    sampleFormat:
      "pcm_s16le" | "pcm_f32le" | "wav" | "opus" | "webm" | undefined,
  ): string {
    switch (sampleFormat) {
      case "pcm_s16le":
      case "pcm_f32le":
      case "wav":
        return "audio/wav";

      case "opus":
        return "audio/opus";

      case "webm":
        return "audio/webm";

      default:
        return "audio/wav";
    }
  }
}
