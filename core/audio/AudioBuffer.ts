// ============================================================================
// FILE: core/audio/AudioBuffer.ts
// PURPOSE:
// Bounded in-memory audio buffer used by the audio pipeline.
//
// RESPONSIBILITY:
// - Store captured AudioChunk instances.
// - Maintain aggregate byte/duration statistics.
// - Enforce memory/duration limits.
// - Preserve audio chunk ordering.
// - Provide a safe contiguous byte representation for transcription.
//
// IMPORTANT:
// AudioBuffer is an INTERNAL core/audio type.
// It must not become the shared application contract.
// ============================================================================

import type { AudioChunk, AudioFormat } from "./AudioCapture";

// ============================================================================
// TYPES
// ============================================================================

export interface AudioBufferOptions {
  /**
   * Maximum amount of audio retained by duration.
   *
   * Default: 30 seconds.
   */
  readonly maxDurationMs?: number;

  /**
   * Maximum amount of raw audio retained in memory.
   *
   * Default: 10 MiB.
   */
  readonly maxBytes?: number;
}

export interface AudioBufferStats {
  readonly chunkCount: number;

  readonly durationMs: number;

  readonly byteLength: number;

  readonly firstTimestamp?: number;

  readonly lastTimestamp?: number;

  /**
   * Format of the audio currently stored in the buffer.
   *
   * Undefined when the buffer is empty.
   */
  readonly format?: AudioFormat;
}

// ============================================================================
// AUDIO BUFFER
// ============================================================================

export class AudioBuffer {
  private readonly chunks: AudioChunk[] = [];

  private durationMs = 0;

  private byteLength = 0;

  private readonly maxDurationMs: number;

  private readonly maxBytes: number;

  public constructor(options: AudioBufferOptions = {}) {
    this.maxDurationMs = validatePositiveLimit(
      options.maxDurationMs ?? 30_000,
      "maxDurationMs",
    );

    this.maxBytes = validatePositiveLimit(
      options.maxBytes ?? 10 * 1024 * 1024,
      "maxBytes",
    );
  }

  // ==========================================================================
  // APPEND
  // ==========================================================================

  /**
   * Append one captured audio chunk.
   *
   * AudioBuffer intentionally requires all chunks in one buffer to use
   * the same audio format. Concatenating differently encoded audio would
   * produce invalid transcription input.
   */
  public append(chunk: AudioChunk): void {
    validateChunk(chunk);

    if (chunk.data.byteLength === 0) {
      return;
    }

    const existingFormat = this.chunks[0]?.format;

    if (existingFormat && !audioFormatsEqual(existingFormat, chunk.format)) {
      throw new Error(
        "Cannot append an audio chunk with a different format to AudioBuffer.",
      );
    }

    this.chunks.push(chunk);

    this.durationMs += chunk.durationMs;

    this.byteLength += chunk.data.byteLength;

    this.trim();
  }

  /**
   * Append multiple chunks while preserving their order.
   */
  public appendMany(chunks: readonly AudioChunk[]): void {
    for (const chunk of chunks) {
      this.append(chunk);
    }
  }

  // ==========================================================================
  // CLEAR / TAKE
  // ==========================================================================

  /**
   * Remove all buffered audio.
   */
  public clear(): void {
    this.chunks.length = 0;

    this.durationMs = 0;

    this.byteLength = 0;
  }

  /**
   * Return the current chunks without exposing the internal array.
   */
  public getChunks(): readonly AudioChunk[] {
    return this.chunks.slice();
  }

  /**
   * Remove and return all current chunks.
   *
   * Useful when an application wants to consume a complete audio window
   * and immediately reuse the same buffer.
   */
  public take(): AudioChunk[] {
    const result = this.chunks.slice();

    this.clear();

    return result;
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  public getStats(): AudioBufferStats {
    const firstChunk = this.chunks[0];

    return {
      chunkCount: this.chunks.length,

      durationMs: this.durationMs,

      byteLength: this.byteLength,

      firstTimestamp: firstChunk?.timestamp,

      lastTimestamp: this.chunks.at(-1)?.timestamp,

      format: firstChunk?.format,
    };
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Return all buffered audio as one contiguous byte array.
   *
   * This is only valid because AudioBuffer enforces a homogeneous
   * audio format across all chunks.
   */
  public toUint8Array(): Uint8Array {
    const output = new Uint8Array(this.byteLength);

    let offset = 0;

    for (const chunk of this.chunks) {
      output.set(chunk.data, offset);

      offset += chunk.data.byteLength;
    }

    return output;
  }

  // ==========================================================================
  // CLONING
  // ==========================================================================

  /**
   * Create an independent AudioBuffer containing the same chunks.
   *
   * The AudioChunk objects themselves are immutable by contract, while
   * Uint8Array data is copied so the resulting buffer does not share
   * mutable byte storage with the source buffer.
   */
  public clone(): AudioBuffer {
    const copy = new AudioBuffer({
      maxDurationMs: this.maxDurationMs,

      maxBytes: this.maxBytes,
    });

    for (const chunk of this.chunks) {
      copy.append({
        ...chunk,

        data: new Uint8Array(chunk.data),
      });
    }

    return copy;
  }

  // ==========================================================================
  // INTERNAL TRIMMING
  // ==========================================================================

  private trim(): void {
    while (
      this.chunks.length > 0 &&
      (this.durationMs > this.maxDurationMs || this.byteLength > this.maxBytes)
    ) {
      const removed = this.chunks.shift();

      if (!removed) {
        break;
      }

      this.durationMs -= removed.durationMs;

      this.byteLength -= removed.data.byteLength;
    }

    // Protect against tiny floating-point accumulation errors.
    if (this.durationMs < 0) {
      this.durationMs = 0;
    }

    if (this.byteLength < 0) {
      this.byteLength = 0;
    }
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validatePositiveLimit(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite value greater than zero.`);
  }

  return value;
}

function validateChunk(chunk: AudioChunk): void {
  if (!chunk) {
    throw new Error("AudioBuffer cannot append an undefined chunk.");
  }

  if (!Number.isFinite(chunk.durationMs) || chunk.durationMs < 0) {
    throw new Error(
      "Audio chunk duration must be a finite non-negative number.",
    );
  }

  if (!Number.isFinite(chunk.timestamp)) {
    throw new Error("Audio chunk timestamp must be a finite number.");
  }

  if (!Number.isInteger(chunk.sequence) || chunk.sequence < 0) {
    throw new Error("Audio chunk sequence must be a non-negative integer.");
  }

  validateAudioFormat(chunk.format);
}

function validateAudioFormat(format: AudioFormat): void {
  if (!Number.isInteger(format.sampleRate) || format.sampleRate <= 0) {
    throw new Error("Audio sample rate must be a positive integer.");
  }

  if (!Number.isInteger(format.channels) || format.channels <= 0) {
    throw new Error("Audio channel count must be a positive integer.");
  }
}

function audioFormatsEqual(left: AudioFormat, right: AudioFormat): boolean {
  return (
    left.sampleRate === right.sampleRate &&
    left.channels === right.channels &&
    left.sampleFormat === right.sampleFormat &&
    left.bitDepth === right.bitDepth
  );
}
