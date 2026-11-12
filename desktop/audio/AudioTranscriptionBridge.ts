// ============================================================================
// FILE: desktop/audio/AudioTranscriptionBridge.ts
// PURPOSE:
// Bridge from live audio capture to the unified interview runtime.
//
// FLOW:
//
//   Microphone (capture lifecycle)
//       â†“
//   Transcription adapter (mock in tests, real Whisper/BYOK in production)
//       â†“
//   Live transcript segmenter (bounded, deduplicated, timestamped)
//       â†“
//   UnifiedInterviewRuntime.processQuestion(source: "voice_transcript")
//       â†“
//   Live interview intelligence (guidance)
//
// SECURITY:
// - No raw audio buffers cross into the runtime; only finalized transcript
//   text is submitted.
// - Transcription consent is checked before any audio is sent to a provider
//   that requires it.
// - The capture lifecycle and transcription adapter are injected so the
//   bridge can be tested without physical microphone hardware.
// ============================================================================

import type { AudioChunk } from "../../core/audio/AudioCapture";
import type { TranscriptionAdapter } from "../../core/audio/TranscriptionAdapter";
import type { InterviewRuntimeResponse } from "../../core/interview/runtime/UnifiedInterviewRuntime";

import { AudioCaptureLifecycle } from "./AudioCaptureLifecycle";
import { LiveTranscriptSegmenter } from "../../core/audio/LiveTranscriptSegmenter";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Narrow runtime surface used by the bridge.
 *
 * `UnifiedInterviewRuntime` satisfies this interface. Tests may inject a
 * lighter fake instead of a full SQLite-backed runtime.
 */
export interface InterviewRuntimeLike {
  processQuestion(input: {
    readonly sessionId: string;
    readonly text: string;
    readonly source: string;
    readonly generateAI?: boolean;
  }): Promise<InterviewRuntimeResponse>;
}

export interface AudioTranscriptionBridgeOptions {
  readonly runtime: InterviewRuntimeLike;

  readonly captureLifecycle: AudioCaptureLifecycle;

  readonly transcriptionAdapter: TranscriptionAdapter;

  /**
   * Runtime session id that transcript segments are submitted under.
   * Created externally (e.g. via RUNTIME_CREATE_SESSION) before start.
   */
  readonly sessionId: string;

  /**
   * Whether external-processing consent has been granted for the adapter.
   */
  readonly consentGiven: boolean;
}

export interface AudioTranscriptionBridgeState {
  readonly sessionId: string;
  readonly isRunning: boolean;
  readonly permission: AudioCaptureLifecycle["permission"];
  readonly isCapturing: boolean;
  readonly isPaused: boolean;
}

// ============================================================================
// BRIDGE
// ============================================================================

export class AudioTranscriptionBridge {
  private readonly runtime: InterviewRuntimeLike;

  private readonly captureLifecycle: AudioCaptureLifecycle;

  private readonly transcriptionAdapter: TranscriptionAdapter;

  private readonly sessionId: string;

  private readonly consentGiven: boolean;

  private readonly segmenter = new LiveTranscriptSegmenter();

  private _isRunning = false;

  private readonly errorListeners = new Set<(error: Error) => void>();

  public constructor(options: AudioTranscriptionBridgeOptions) {
    this.runtime = options.runtime;
    this.captureLifecycle = options.captureLifecycle;
    this.transcriptionAdapter = options.transcriptionAdapter;
    this.sessionId = options.sessionId;
    this.consentGiven = options.consentGiven;

    this.captureLifecycle.onError((error) => {
      this.emitError(error);
    });
  }

  public get sessionIdReadonly(): string {
    return this.sessionId;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get state(): AudioTranscriptionBridgeState {
    return {
      sessionId: this.sessionId,
      isRunning: this._isRunning,
      permission: this.captureLifecycle.permission,
      isCapturing: this.captureLifecycle.isCapturing,
      isPaused: this.captureLifecycle.isPaused,
    };
  }

  public onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => { this.errorListeners.delete(listener); };
  }

  public async start(): Promise<void> {
    if (this._isRunning) {
      return;
    }

    // Consent is required before any audio is sent to a consent-gated provider.
    if (this.transcriptionAdapter.requireConsent() && !this.consentGiven) {
      throw new Error(
        "Transcription consent is required before starting the audio-to-runtime bridge.",
      );
    }

    await this.captureLifecycle.start();

    this.captureLifecycle.onChunk((chunk) => {
      void this.handleChunk(chunk);
    });

    this._isRunning = true;
  }

  public async stop(): Promise<void> {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;
    await this.captureLifecycle.stop();
  }

  public async dispose(): Promise<void> {
    this._isRunning = false;
    await this.captureLifecycle.dispose();
  }

  // ==========================================================================
  // CHANNEL: capture chunk â†’ transcription â†’ segment â†’ runtime question
  // ==========================================================================

  private async handleChunk(chunk: AudioChunk): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    try {
      const result = await this.transcriptionAdapter.transcribe(
        {
          audio: chunk.data,
          mimeType: "audio/wav",
          format: chunk.format as never,
          timestamp: chunk.timestamp,
        },
        this.consentGiven,
      );

      this.segmenter.addFinal(
        result,
        chunk.timestamp,
        chunk.timestamp + chunk.durationMs,
      );

      for (const segment of this.segmenter.takeFinalEntries()) {
        if (!segment.text.trim()) {
          continue;
        }

        await this.runtime.processQuestion({
          sessionId: this.sessionId,
          text: segment.text,
          source: "voice_transcript",
          generateAI: false,
        });
      }
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      this.emitError(normalized);
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        /* error listeners must not break the bridge. */
      }
    }
  }
}
