// core/audio/AudioCapture.ts


// core/audio/AudioCapture.ts

export type AudioSampleFormat =
  | "pcm_s16le"
  | "pcm_f32le"
  | "wav"
  | "opus"
  | "webm";

export interface AudioFormat {
  readonly sampleRate: number;
  readonly channels: number;
  readonly sampleFormat: AudioSampleFormat;
  readonly bitDepth?: 16 | 24 | 32;
}

export interface AudioChunk {
  readonly id: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly durationMs: number;
  readonly data: Uint8Array;
  readonly format: AudioFormat;
}

export interface AudioCaptureOptions {
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly sampleFormat?: AudioSampleFormat;
  readonly bitDepth?: 16 | 24 | 32;
  readonly chunkDurationMs?: number;
  readonly maxBufferDurationMs?: number;
}

export interface AudioCaptureEvents {
  readonly onChunk?: (chunk: AudioChunk) => void;
  readonly onError?: (error: Error) => void;
  readonly onStarted?: () => void;
  readonly onStopped?: () => void;
}

export interface AudioCapture {
  readonly isCapturing: boolean;

  start(events?: AudioCaptureEvents): Promise<void>;

  stop(): Promise<void>;

  pause(): Promise<void>;

  resume(): Promise<void>;

  getFormat(): AudioFormat;

  onChunk(listener: (chunk: AudioChunk) => void): () => void;

  onError(listener: (error: Error) => void): () => void;

  dispose(): Promise<void>;
}

export class AudioCaptureError extends Error {
  public readonly code:
    | "ALREADY_STARTED"
    | "NOT_STARTED"
    | "CAPTURE_FAILED"
    | "INVALID_CONFIGURATION"
    | "DISPOSED";

  public constructor(
    code: AudioCaptureError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AudioCaptureError";
    this.code = code;
  }
}

/**
 * Base implementation used by desktop adapters.
 *
 * The class deliberately does not access navigator.mediaDevices,
 * Electron APIs, FFmpeg, or Node native audio APIs.
 *
 * Those concerns belong to the desktop layer.
 */
export abstract class BaseAudioCapture implements AudioCapture {
  protected _isCapturing = false;
  protected _isPaused = false;
  protected _disposed = false;

  private sequence = 0;

  private readonly chunkListeners = new Set<
    (chunk: AudioChunk) => void
  >();

  private readonly errorListeners = new Set<(error: Error) => void>();

  protected readonly format: AudioFormat;

  protected constructor(options: AudioCaptureOptions = {}) {
    const sampleRate = options.sampleRate ?? 16_000;
    const channels = options.channels ?? 1;
    const sampleFormat = options.sampleFormat ?? "pcm_s16le";
    const bitDepth = options.bitDepth ?? 16;

    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new AudioCaptureError(
        "INVALID_CONFIGURATION",
        "Audio sample rate must be a positive integer.",
      );
    }

    if (!Number.isInteger(channels) || channels <= 0) {
      throw new AudioCaptureError(
        "INVALID_CONFIGURATION",
        "Audio channel count must be a positive integer.",
      );
    }

    this.format = {
      sampleRate,
      channels,
      sampleFormat,
      bitDepth,
    };
  }

  public get isCapturing(): boolean {
    return this._isCapturing;
  }

  public getFormat(): AudioFormat {
    return this.format;
  }

  public async start(events: AudioCaptureEvents = {}): Promise<void> {
    this.assertNotDisposed();

    if (this._isCapturing) {
      throw new AudioCaptureError(
        "ALREADY_STARTED",
        "Audio capture is already running.",
      );
    }

    try {
      this._isCapturing = true;
      this._isPaused = false;

      if (events.onChunk) {
        this.onChunk(events.onChunk);
      }

      if (events.onError) {
        this.onError(events.onError);
      }

      await this.startCapture();

      events.onStarted?.();
    } catch (error) {
      this._isCapturing = false;

      const normalized = normalizeError(error);

      this.emitError(normalized);

      throw new AudioCaptureError(
        "CAPTURE_FAILED",
        normalized.message,
        { cause: normalized },
      );
    }
  }

  public async stop(): Promise<void> {
    this.assertNotDisposed();

    if (!this._isCapturing) {
      return;
    }

    try {
      await this.stopCapture();
    } finally {
      this._isCapturing = false;
      this._isPaused = false;
    }
  }

  public async pause(): Promise<void> {
    this.assertNotDisposed();

    if (!this._isCapturing) {
      throw new AudioCaptureError(
        "NOT_STARTED",
        "Cannot pause audio capture before it has started.",
      );
    }

    if (this._isPaused) {
      return;
    }

    await this.pauseCapture();
    this._isPaused = true;
  }

  public async resume(): Promise<void> {
    this.assertNotDisposed();

    if (!this._isCapturing) {
      throw new AudioCaptureError(
        "NOT_STARTED",
        "Cannot resume audio capture before it has started.",
      );
    }

    if (!this._isPaused) {
      return;
    }

    await this.resumeCapture();
    this._isPaused = false;
  }

  public onChunk(listener: (chunk: AudioChunk) => void): () => void {
    this.assertNotDisposed();

    this.chunkListeners.add(listener);

    return () => {
      this.chunkListeners.delete(listener);
    };
  }

  public onError(listener: (error: Error) => void): () => void {
    this.assertNotDisposed();

    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  protected emitChunk(
    data: Uint8Array,
    durationMs: number,
    timestamp = Date.now(),
  ): AudioChunk {
    const chunk: AudioChunk = {
      id: cryptoRandomId(),
      sequence: this.sequence++,
      timestamp,
      durationMs,
      data,
      format: this.format,
    };

    for (const listener of this.chunkListeners) {
      try {
        listener(chunk);
      } catch (error) {
        this.emitError(normalizeError(error));
      }
    }

    return chunk;
  }

  protected emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Listener failures must never break the capture pipeline.
      }
    }
  }

  protected assertNotDisposed(): void {
    if (this._disposed) {
      throw new AudioCaptureError(
        "DISPOSED",
        "Audio capture has already been disposed.",
      );
    }
  }

  public async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    try {
      if (this._isCapturing) {
        await this.stopCapture();
      }
    } finally {
      this._isCapturing = false;
      this._isPaused = false;
      this.chunkListeners.clear();
      this.errorListeners.clear();
      this._disposed = true;
    }
  }

  protected abstract startCapture(): Promise<void>;

  protected abstract stopCapture(): Promise<void>;

  protected async pauseCapture(): Promise<void> {}

  protected async resumeCapture(): Promise<void> {}
}

function cryptoRandomId(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `audio-${random}`;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}