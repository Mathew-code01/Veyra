// ============================================================================
// FILE: core/audio/AudioTranscriptionService.ts
// PURPOSE:
// High-level audio → transcription facade.
//
// RESPONSIBILITY:
// - Convert AudioBuffer into a TranscriptionRequest.
// - Preserve the actual captured audio format.
// - Pass cancellation through.
// - Return transcription results together with audio statistics.
//
// IMPORTANT:
// This service does NOT know about conversation.
// Audio → conversation is a Stage B responsibility.
// ============================================================================

import type { AudioBuffer, AudioBufferStats } from "./AudioBuffer";

import type {
  PartialTranscription,
  TranscriptionAudioFormat,
  TranscriptionEngine,
  TranscriptionResult,
} from "./TranscriptionEngine";

// ============================================================================
// OPTIONS
// ============================================================================

export interface AudioTranscriptionOptions {
  readonly language?: string;

  readonly prompt?: string;

  readonly signal?: AbortSignal;
}

// ============================================================================
// RESULT
// ============================================================================

export interface AudioTranscriptionServiceResult extends TranscriptionResult {
  readonly audioStats: AudioBufferStats;
}

// ============================================================================
// SERVICE
// ============================================================================

export class AudioTranscriptionService {
  private readonly engine: TranscriptionEngine;

  public constructor(engine: TranscriptionEngine) {
    if (!engine) {
      throw new Error(
        "AudioTranscriptionService requires a TranscriptionEngine.",
      );
    }

    this.engine = engine;
  }

  // ==========================================================================
  // BATCH TRANSCRIPTION
  // ==========================================================================

  public async transcribe(
    audioBuffer: AudioBuffer,
    options: AudioTranscriptionOptions = {},
  ): Promise<AudioTranscriptionServiceResult> {
    const request = this.createRequest(audioBuffer, options);

    const result = await this.engine.transcribe(request);

    return Object.freeze({
      ...result,

      audioStats: request.audioStats,
    });
  }

  // ==========================================================================
  // STREAM TRANSCRIPTION
  // ==========================================================================

  public async transcribeStream(
    audioBuffer: AudioBuffer,
    onPartial: (partial: PartialTranscription) => void,
    options: AudioTranscriptionOptions = {},
  ): Promise<AudioTranscriptionServiceResult> {
    if (typeof onPartial !== "function") {
      throw new Error(
        "AudioTranscriptionService.transcribeStream requires onPartial.",
      );
    }

    const request = this.createRequest(audioBuffer, options);

    const result = await this.engine.transcribeStream(request, onPartial);

    return Object.freeze({
      ...result,

      audioStats: request.audioStats,
    });
  }

  // ==========================================================================
  // PROVIDER
  // ==========================================================================

  public getProviderName(): string {
    return this.engine.getProviderName();
  }

  public getQueueLength(): number {
    return this.engine.getQueueLength();
  }

  public getActiveRequests(): number {
    return this.engine.getActiveRequests();
  }

  // ==========================================================================
  // REQUEST CREATION
  // ==========================================================================

  private createRequest(
    audioBuffer: AudioBuffer,
    options: AudioTranscriptionOptions,
  ): TranscriptionRequestWithStats {
    if (!audioBuffer) {
      throw new Error("AudioTranscriptionService requires an AudioBuffer.");
    }

    const stats = audioBuffer.getStats();

    if (stats.byteLength <= 0) {
      throw new Error("Cannot transcribe an empty AudioBuffer.");
    }

    const chunks = audioBuffer.getChunks();

    const firstChunk = chunks[0];

    if (!firstChunk) {
      throw new Error("AudioBuffer reports audio data but contains no chunks.");
    }

    /*
     * AudioBuffer guarantees homogeneous formats.
     *
     * We therefore safely use the first chunk as the canonical format
     * for the entire buffered audio request.
     */
    const format = toTranscriptionAudioFormat(firstChunk.format);

    return {
      audio: audioBuffer.toUint8Array(),

      mimeType: resolveMimeType(format.sampleFormat),

      format,

      language: options.language?.trim() || undefined,

      prompt: options.prompt?.trim() || undefined,

      /*
       * Timestamp is metadata describing when this captured buffer
       * began. It is intentionally not interpreted as transcript
       * start/end timing by TranscriptionEngine.
       */
      timestamp: firstChunk.timestamp,

      signal: options.signal,

      audioStats: stats,
    };
  }
}

// ============================================================================
// INTERNAL REQUEST TYPE
// ============================================================================

interface TranscriptionRequestWithStats {
  readonly audio: Uint8Array;

  readonly mimeType: string;

  readonly format: TranscriptionAudioFormat;

  readonly language?: string;

  readonly prompt?: string;

  readonly timestamp?: number;

  readonly signal?: AbortSignal;

  readonly audioStats: AudioBufferStats;
}

// ============================================================================
// FORMAT MAPPING
// ============================================================================

function toTranscriptionAudioFormat(format: {
  readonly sampleRate: number;
  readonly channels: number;
  readonly sampleFormat: "pcm_s16le" | "pcm_f32le" | "wav" | "opus" | "webm";
  readonly bitDepth?: 16 | 24 | 32;
}): TranscriptionAudioFormat {
  return {
    sampleRate: format.sampleRate,

    channels: format.channels,

    sampleFormat: format.sampleFormat,

    bitDepth: format.bitDepth,
  };
}

// ============================================================================
// MIME TYPE
// ============================================================================

function resolveMimeType(
  sampleFormat: "pcm_s16le" | "pcm_f32le" | "wav" | "opus" | "webm",
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
      return "application/octet-stream";
  }
}
