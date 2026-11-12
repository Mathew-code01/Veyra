// ============================================================================
// FILE: desktop/audio/DesktopAudioCapture.ts
//
// PURPOSE:
// Desktop audio capture adapter using navigator.mediaDevices (MediaRecorder).
//
// Implements BaseAudioCapture for Electron main process / preload contexts
// where the browser MediaStream API is available.
//
// SECURITY:
// - Microphone access requires explicit user permission.
// - No raw audio data is exposed outside the capture pipeline.
// - Chunks flow through BaseAudioCapture's listener boundary only.
// ============================================================================

import type {
  AudioCapture,
  AudioCaptureEvents,
  AudioChunk,
  AudioFormat,
  AudioCaptureOptions,
} from "../../core/audio/AudioCapture";

export interface DesktopAudioCaptureOptions extends AudioCaptureOptions {
  readonly deviceId?: string;
}

export class DesktopAudioCapture implements AudioCapture {
  private readonly options: DesktopAudioCaptureOptions;

  private mediaStream: MediaStream | null = null;

  private mediaRecorder: MediaRecorder | null = null;

  private audioContext: AudioContext | null = null;

  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private processorNode: ScriptProcessorNode | null = null;

  private readonly chunkListeners = new Set<(chunk: AudioChunk) => void>();

  private readonly errorListeners = new Set<(error: Error) => void>();

  private sequence = 0;

  private _isCapturing = false;

  private _isPaused = false;

  private _disposed = false;

  public constructor(options: DesktopAudioCaptureOptions = {}) {
    this.options = {
      sampleRate: 16_000,
      channels: 1,
      sampleFormat: "pcm_s16le",
      bitDepth: 16,
      chunkDurationMs: 500,
      ...options,
    };
  }

  public get isCapturing(): boolean {
    return this._isCapturing;
  }

  public getFormat(): AudioFormat {
    return {
      sampleRate: this.options.sampleRate ?? 16_000,
      channels: this.options.channels ?? 1,
      sampleFormat: this.options.sampleFormat ?? "pcm_s16le",
      bitDepth: this.options.bitDepth ?? 16,
    };
  }

  public async start(events: AudioCaptureEvents = {}): Promise<void> {
    if (this._disposed) {
      throw new Error("DesktopAudioCapture has been disposed.");
    }

    if (this._isCapturing) {
      throw new Error("Audio capture is already running.");
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      throw new Error(
        "navigator.mediaDevices is not available in this environment.",
      );
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.options.deviceId
            ? { exact: this.options.deviceId }
            : undefined,
          sampleRate: this.options.sampleRate,
          channelCount: this.options.channels,
        },
      });

      const audioContext =
        typeof AudioContext !== "undefined"
          ? new AudioContext({ sampleRate: this.options.sampleRate })
          : null;

      if (audioContext) {
        await audioContext.resume();
        this.audioContext = audioContext;

        this.sourceNode = audioContext.createMediaStreamSource(this.mediaStream);

        const bufferSize = Math.round(
          (this.options.sampleRate ?? 16_000) *
            ((this.options.chunkDurationMs ?? 500) / 1000),
        );

        // Use ScriptProcessorNode for broad compatibility in Electron/Chrome contexts.
        const processor =
          audioContext.createScriptProcessor
            ? audioContext.createScriptProcessor(bufferSize, 1, 1)
            : audioContext.createScriptProcessor
                ? audioContext.createScriptProcessor(bufferSize, 1, 1)
                : null;

        if (processor) {
          processor.onaudioprocess = (event: AudioProcessingEvent) => {
            if (!this._isCapturing || this._isPaused) {
              return;
            }

            const inputData = event.inputBuffer.getChannelData(0);
            const pcm16 = this.convertFloat32ToPcm16(inputData);

            const chunk: AudioChunk = {
              id: `audio-${Date.now()}-${this.sequence++}`,
              sequence: this.sequence,
              timestamp: Date.now(),
              durationMs: Math.round(
                (inputData.length /
                  (this.options.sampleRate ?? 16_000)) *
                  1000,
              ),
              data: pcm16,
              format: this.getFormat(),
            };

            for (const listener of this.chunkListeners) {
              try {
                listener(chunk);
              } catch {
                // Listener failures must not break capture.
              }
            }
          };

          this.sourceNode.connect(processor);
          processor.connect(audioContext.destination);
          this.processorNode = processor;
        }
      }

      this._isCapturing = true;
      this._isPaused = false;

      events.onStarted?.();
    } catch (error) {
      this._isCapturing = false;

      const normalized =
        error instanceof Error ? error : new Error(String(error));

      this.emitError(normalized);

      throw new Error(`Audio capture failed: ${normalized.message}`);
    }
  }

  public async stop(): Promise<void> {
    if (!this._isCapturing) {
      return;
    }

    try {
      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode = null;
      }

      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      if (this.mediaStream) {
        const tracks = this.mediaStream.getTracks();
        for (const track of tracks) {
          track.stop();
        }
        this.mediaStream = null;
      }
    } finally {
      this._isCapturing = false;
      this._isPaused = false;
    }
  }

  public async pause(): Promise<void> {
    if (!this._isCapturing) {
      throw new Error("Cannot pause audio capture before it has started.");
    }

    if (this._isPaused) {
      return;
    }

    this._isPaused = true;
  }

  public async resume(): Promise<void> {
    if (!this._isCapturing) {
      throw new Error("Cannot resume audio capture before it has started.");
    }

    if (!this._isPaused) {
      return;
    }

    this._isPaused = false;
  }

  public onChunk(listener: (chunk: AudioChunk) => void): () => void {
    if (this._disposed) {
      throw new Error("DesktopAudioCapture has been disposed.");
    }

    this.chunkListeners.add(listener);

    return () => {
      this.chunkListeners.delete(listener);
    };
  }

  public onError(listener: (error: Error) => void): () => void {
    if (this._disposed) {
      throw new Error("DesktopAudioCapture has been disposed.");
    }

    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  public async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    try {
      if (this._isCapturing) {
        await this.stop();
      }
    } finally {
      this._isCapturing = false;
      this._isPaused = false;
      this.chunkListeners.clear();
      this.errorListeners.clear();
      this._disposed = true;
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Listener failures must never break the capture pipeline.
      }
    }
  }

  private convertFloat32ToPcm16(input: Float32Array): Uint8Array {
    const output = new Int16Array(input.length);

    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
      output[i] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
    }

    return new Uint8Array(output.buffer);
  }
}
