// ============================================================================
// FILE: desktop/audio/AudioCaptureLifecycle.ts
// PURPOSE:
// Microphone capture permission and lifecycle management.
//
// RESPONSIBILITY:
// - Own a single AudioCapture instance (injectable for testing).
// - Track microphone permission state (granted/denied/prompt/unknown).
// - Expose start, pause, resume, stop, dispose.
// - Emit lifecycle state changes so the UI can reflect status honestly.
// - Never expose raw audio buffers outside this module; chunks flow only
//   into the transcription bridge.
//
// SECURITY:
// - Microphone capture never starts automatically. start() requires an
//   explicit grant of permission.
// - The capture instance is injected so tests can run without physical
//   microphone hardware.
// ============================================================================

import type {
  AudioCapture,
  AudioCaptureEvents,
  AudioChunk,
  AudioFormat,
} from "../../core/audio/AudioCapture";

import { DesktopAudioCapture } from "./DesktopAudioCapture";

// ============================================================================
// TYPES
// ============================================================================

export type CapturePermissionState = "granted" | "denied" | "prompt" | "unknown";

export interface AudioCaptureLifecycleOptions {
  /** Injected capture implementation (defaults to DesktopAudioCapture). */
  readonly capture?: AudioCapture;

  readonly deviceId?: string;

  readonly format?: AudioFormat;
}

export interface AudioCaptureLifecycleState {
  readonly isCapturing: boolean;
  readonly isPaused: boolean;
  readonly permission: CapturePermissionState;
  readonly deviceId: string | null;
  readonly format: AudioFormat;
}

export interface AudioCaptureLifecycleEvents {
  readonly onStateChange?: (state: AudioCaptureLifecycleState) => void;
  readonly onError?: (error: Error) => void;
  readonly onChunk?: (chunk: AudioChunk) => void;
}

// ============================================================================
// LIFECYCLE
// ============================================================================

export class AudioCaptureLifecycle {
  private readonly capture: AudioCapture;

  private readonly deviceId: string | null;

  private readonly format: AudioFormat;

  private _permission: CapturePermissionState = "unknown";

  private _isPaused = false;

  private _disposed = false;

  private readonly stateListeners = new Set<(state: AudioCaptureLifecycleState) => void>();

  private readonly errorListeners = new Set<(error: Error) => void>();

  private readonly chunkListeners = new Set<(chunk: AudioChunk) => void>();

  public constructor(options: AudioCaptureLifecycleOptions = {}) {
    this.capture = options.capture ?? new DesktopAudioCapture({
      deviceId: options.deviceId,
      ...options.format,
    });

    this.deviceId = options.deviceId ?? null;
    this.format = options.format ?? { sampleRate: 16_000, channels: 1, sampleFormat: "pcm_s16le", bitDepth: 16 };

    this.capture.onChunk((chunk) => {
      for (const listener of this.chunkListeners) {
        try { listener(chunk); } catch { /* chunk listeners must not break capture. */ }
      }
    });

    this.capture.onError((error) => {
      this._permission = "denied";
      this.emitState();
      for (const listener of this.errorListeners) {
        try { listener(error); } catch { /* error listeners must not break capture. */ }
      }
    });
  }

  public get state(): AudioCaptureLifecycleState {
    return {
      isCapturing: this.capture.isCapturing,
      isPaused: this._isPaused,
      permission: this._permission,
      deviceId: this.deviceId,
      format: this.format,
    };
  }

  public get permission(): CapturePermissionState {
    return this._permission;
  }

  public get isCapturing(): boolean {
    return this.capture.isCapturing;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public onStateChange(listener: (state: AudioCaptureLifecycleState) => void): () => void {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  public onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => { this.errorListeners.delete(listener); };
  }

  public onChunk(listener: (chunk: AudioChunk) => void): () => void {
    this.chunkListeners.add(listener);
    return () => { this.chunkListeners.delete(listener); };
  }

  // =========================================================================
  // PERMISSION
  // =========================================================================

  /**
   * Simulate the OS/user granting microphone permission.
   *
   * In production this is set after a successful user-initiated
   * getUserMedia flow. It is exposed here so tests can drive the lifecycle
   * without a physical microphone.
   */
  public grantPermission(): void {
    if (this._disposed) return;
    this._permission = "granted";
    this.emitState();
  }

  /**
   * Simulate the OS/user denying microphone permission.
   */
  public denyPermission(): void {
    if (this._disposed) return;
    this._permission = "denied";
    this.emitState();
  }

  public async requestPermission(): Promise<CapturePermissionState> {
    if (this._disposed) throw new Error("AudioCaptureLifecycle has been disposed.");
    // The real permission prompt is owned by the renderer/preload layer
    // (navigator.mediaDevices). This boundary records the resulting state.
    return this._permission;
  }

  // =========================================================================
  // CAPTURE
  // =========================================================================

  public async start(events: AudioCaptureEvents = {}): Promise<void> {
    if (this._disposed) throw new Error("AudioCaptureLifecycle has been disposed.");
    if (this._permission !== "granted") {
      throw new Error("Microphone permission must be granted before capture starts.");
    }
    if (this.capture.isCapturing) {
      throw new Error("Audio capture is already running.");
    }

    this.capture.onChunk((chunk) => {
      for (const listener of this.chunkListeners) {
        try { listener(chunk); } catch { /* chunk listeners must not break capture. */ }
      }
    });

    const captureEvents: AudioCaptureEvents = {
      ...events,
      onStarted: () => {
        this._isPaused = false;
        this.emitState();
        events.onStarted?.();
      },
      onStopped: () => {
        this._isPaused = false;
        this.emitState();
        events.onStopped?.();
      },
    };

    await this.capture.start(captureEvents);
    this.emitState();
  }

  public async pause(): Promise<void> {
    if (this._disposed) throw new Error("AudioCaptureLifecycle has been disposed.");
    if (!this.capture.isCapturing) {
      throw new Error("Cannot pause audio capture before it has started.");
    }
    if (this._isPaused) return;
    await this.capture.pause();
    this._isPaused = true;
    this.emitState();
  }

  public async resume(): Promise<void> {
    if (this._disposed) throw new Error("AudioCaptureLifecycle has been disposed.");
    if (!this.capture.isCapturing) {
      throw new Error("Cannot resume audio capture before it has started.");
    }
    if (!this._isPaused) return;
    await this.capture.resume();
    this._isPaused = false;
    this.emitState();
  }

  public async stop(): Promise<void> {
    if (this._disposed) return;
    if (this.capture.isCapturing) {
      await this.capture.stop();
    }
    this._isPaused = false;
    this.emitState();
  }

  public async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    if (this.capture.isCapturing) {
      try { await this.capture.stop(); } catch { /* best effort. */ }
    }
    this._isPaused = false;
    this.emitState();
  }

  private emitState(): void {
    const state = this.state;
    for (const listener of this.stateListeners) {
      try { listener(state); } catch { /* state listeners must not break capture. */ }
    }
  }
}
