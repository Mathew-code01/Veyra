// core/audio/AudioBuffer.ts


// core/audio/AudioBuffer.ts

import type { AudioChunk } from "./AudioCapture";

export interface AudioBufferOptions {
  readonly maxDurationMs?: number;
  readonly maxBytes?: number;
}

export interface AudioBufferStats {
  readonly chunkCount: number;
  readonly durationMs: number;
  readonly byteLength: number;
  readonly firstTimestamp?: number;
  readonly lastTimestamp?: number;
}

export class AudioBuffer {
  private readonly chunks: AudioChunk[] = [];

  private durationMs = 0;
  private byteLength = 0;

  private readonly maxDurationMs: number;
  private readonly maxBytes: number;

  public constructor(options: AudioBufferOptions = {}) {
    this.maxDurationMs = options.maxDurationMs ?? 30_000;
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;

    if (this.maxDurationMs <= 0) {
      throw new Error("maxDurationMs must be greater than zero.");
    }

    if (this.maxBytes <= 0) {
      throw new Error("maxBytes must be greater than zero.");
    }
  }

  public append(chunk: AudioChunk): void {
    if (chunk.data.byteLength === 0) {
      return;
    }

    this.chunks.push(chunk);
    this.durationMs += chunk.durationMs;
    this.byteLength += chunk.data.byteLength;

    this.trim();
  }

  public appendMany(chunks: readonly AudioChunk[]): void {
    for (const chunk of chunks) {
      this.append(chunk);
    }
  }

  public clear(): void {
    this.chunks.length = 0;
    this.durationMs = 0;
    this.byteLength = 0;
  }

  public getChunks(): readonly AudioChunk[] {
    return this.chunks.slice();
  }

  public getStats(): AudioBufferStats {
    return {
      chunkCount: this.chunks.length,
      durationMs: this.durationMs,
      byteLength: this.byteLength,
      firstTimestamp: this.chunks[0]?.timestamp,
      lastTimestamp: this.chunks.at(-1)?.timestamp,
    };
  }

  public toUint8Array(): Uint8Array {
    const output = new Uint8Array(this.byteLength);

    let offset = 0;

    for (const chunk of this.chunks) {
      output.set(chunk.data, offset);
      offset += chunk.data.byteLength;
    }

    return output;
  }

  public take(): AudioChunk[] {
    const result = this.chunks.slice();
    this.clear();
    return result;
  }

  public clone(): AudioBuffer {
    const copy = new AudioBuffer({
      maxDurationMs: this.maxDurationMs,
      maxBytes: this.maxBytes,
    });

    copy.appendMany(this.chunks);
    return copy;
  }

  private trim(): void {
    while (
      this.chunks.length > 0 &&
      (this.durationMs > this.maxDurationMs ||
        this.byteLength > this.maxBytes)
    ) {
      const removed = this.chunks.shift();

      if (!removed) {
        break;
      }

      this.durationMs -= removed.durationMs;
      this.byteLength -= removed.data.byteLength;
    }
  }
}