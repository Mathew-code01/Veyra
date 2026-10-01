// ============================================================================
// FILE: core/audio/AudioTranscriptionPipeline.ts
// PURPOSE:
// Production audio transcription orchestration.
//
// RESPONSIBILITY:
//
//   Audio input
//       ↓
//   TranscriptionEngine
//       ↓
//   TranscriptAssembler
//       ↓
//   AudioTranscriptPublisher
//       ↓
//   AudioConversationBridge
//       ↓
//   ConversationManager
//
// This is the runtime connection between the audio transcription domain
// and the conversation domain.
//
// IMPORTANT:
//
// This class owns orchestration only.
//
// It does NOT:
// - implement audio capture
// - implement Whisper
// - implement conversation analysis
// - implement conversation memory
// - implement AI inference
//
// Each subsystem remains responsible for its own domain.
// ============================================================================

import type { UUID } from "../../shared/types/common";

import type { ConversationAnalysis } from "../../shared/types/conversation";

import {
  TranscriptionEngine,
  type PartialTranscription,
  type TranscriptionRequest,
  type TranscriptionResult,
} from "./TranscriptionEngine";

import {
  TranscriptAssembler,
  type TranscriptEntry,
  type TranscriptSnapshot,
} from "./TranscriptAssembler";

import {
  AudioTranscriptPublisher,
  type AudioTranscriptPublisherOptions,
  type PublishedAudioTranscript,
} from "./AudioTranscriptPublisher";

// ============================================================================
// OPTIONS
// ============================================================================

export interface AudioTranscriptionPipelineOptions extends AudioTranscriptPublisherOptions {
  /**
   * Required transcription engine.
   */
  readonly engine: TranscriptionEngine;

  /**
   * Optional assembler.
   *
   * Supplying one is useful for testing or lifecycle ownership.
   */
  readonly assembler?: TranscriptAssembler;

  /**
   * Optional session start time.
   *
   * If supplied, TranscriptAssembler relative timestamps are converted
   * into authoritative absolute timestamps.
   */
  readonly sessionStartedAt?: number;
}

// ============================================================================
// CALLBACKS
// ============================================================================

export interface AudioTranscriptionPipelineCallbacks {
  /**
   * Called whenever a partial transcription is produced.
   *
   * Partial results never enter conversation memory.
   */
  readonly onPartial?: (
    snapshot: TranscriptSnapshot,
    partial: PartialTranscription,
  ) => void;

  /**
   * Called when a finalized transcript enters the conversation boundary.
   */
  readonly onFinal?: (
    published: PublishedAudioTranscript,
    snapshot: TranscriptSnapshot,
  ) => void;

  /**
   * Called when transcription completes.
   */
  readonly onComplete?: (
    result: TranscriptionResult,
    snapshot: TranscriptSnapshot,
  ) => void;

  /**
   * Called when transcription fails.
   */
  readonly onError?: (error: Error) => void;
}

// ============================================================================
// RESULT
// ============================================================================

export interface AudioTranscriptionPipelineResult {
  readonly transcription: TranscriptionResult;

  readonly snapshot: TranscriptSnapshot;

  readonly published: readonly PublishedAudioTranscript[];

  readonly analyses: readonly ConversationAnalysis[];
}

// ============================================================================
// PIPELINE
// ============================================================================

export class AudioTranscriptionPipeline {
  private readonly engine: TranscriptionEngine;

  private readonly assembler: TranscriptAssembler;

  private readonly publisher: AudioTranscriptPublisher;

  private readonly sessionStartedAt?: number;

  private activeSessionId?: UUID;

  public constructor(options: AudioTranscriptionPipelineOptions) {
    if (!options) {
      throw new Error("AudioTranscriptionPipeline options are required.");
    }

    if (!options.engine) {
      throw new Error(
        "AudioTranscriptionPipeline requires a TranscriptionEngine.",
      );
    }

    this.engine = options.engine;

    this.assembler = options.assembler ?? new TranscriptAssembler();

    this.publisher = new AudioTranscriptPublisher(options);

    this.sessionStartedAt = validateOptionalTimestamp(
      options.sessionStartedAt,
      "sessionStartedAt",
    );
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  /**
   * Run streaming transcription for one audio session.
   *
   * The provider may emit multiple partial results.
   *
   * Partial results update the assembler's visible snapshot but do not
   * enter conversation memory.
   *
   * The resolved TranscriptionResult is treated as authoritative and
   * is committed exactly once.
   */
  public async transcribeStream(
    sessionId: UUID,
    request: TranscriptionRequest,
    callbacks: AudioTranscriptionPipelineCallbacks = {},
  ): Promise<AudioTranscriptionPipelineResult> {
    this.beginSession(sessionId);

    const published: PublishedAudioTranscript[] = [];

    try {
      const result = await this.engine.transcribeStream(request, (partial) => {
        this.handlePartial(partial, sessionId, callbacks);
      });

      /*
       * Some providers return the final result without emitting a final
       * partial event.
       *
       * Therefore the resolved TranscriptionResult is authoritative.
       *
       * addFinal() updates the assembler and returns a snapshot.
       * It does NOT return a TranscriptEntry.
       */
      this.assembler.addFinal(
        result,
        this.getRelativeStartTime(result),
        this.getRelativeEndTime(result),
      );

      /*
       * Consume only finalized entries that have not already been
       * consumed by a downstream integration.
       *
       * This is the important Stage A → Stage B handoff.
       */
      const finalEntries = this.assembler.takeFinalEntries();

      const snapshot = this.assembler.getSnapshot();

      const finalPublished = this.publishFinalEntries(finalEntries, sessionId);

      published.push(...finalPublished);

      for (const item of finalPublished) {
        callbacks.onFinal?.(item, snapshot);
      }

      callbacks.onComplete?.(result, snapshot);

      const analyses = published
        .map((item) => item.analysis)
        .filter(
          (analysis): analysis is ConversationAnalysis =>
            analysis !== undefined,
        );

      return {
        transcription: result,

        snapshot,

        published: Object.freeze(published.slice()),

        analyses: Object.freeze(analyses),
      };
    } catch (error) {
      const normalized = normalizeError(error);

      callbacks.onError?.(normalized);

      throw normalized;
    }
  }

  // ==========================================================================
  // BATCH
  // ==========================================================================

  /**
   * Run one non-streaming transcription request.
   *
   * The resulting transcription is finalized and immediately forwarded
   * into conversation analysis.
   */
  public async transcribe(
    sessionId: UUID,
    request: TranscriptionRequest,
    callbacks: AudioTranscriptionPipelineCallbacks = {},
  ): Promise<AudioTranscriptionPipelineResult> {
    this.beginSession(sessionId);

    try {
      const result = await this.engine.transcribe(request);

      /*
       * addFinal() updates the assembler.
       *
       * It returns TranscriptSnapshot, so we deliberately do not treat
       * its return value as a TranscriptEntry.
       */
      this.assembler.addFinal(
        result,
        this.getRelativeStartTime(result),
        this.getRelativeEndTime(result),
      );

      /*
       * Consume only newly finalized entries.
       */
      const finalEntries = this.assembler.takeFinalEntries();

      const snapshot = this.assembler.getSnapshot();

      const published = this.publishFinalEntries(finalEntries, sessionId);

      for (const item of published) {
        callbacks.onFinal?.(item, snapshot);
      }

      callbacks.onComplete?.(result, snapshot);

      const analyses = published
        .map((item) => item.analysis)
        .filter(
          (analysis): analysis is ConversationAnalysis =>
            analysis !== undefined,
        );

      return {
        transcription: result,

        snapshot,

        published,

        analyses: Object.freeze(analyses),
      };
    } catch (error) {
      const normalized = normalizeError(error);

      callbacks.onError?.(normalized);

      throw normalized;
    }
  }

  // ==========================================================================
  // PARTIAL HANDLING
  // ==========================================================================

  private handlePartial(
    partial: PartialTranscription,
    sessionId: UUID,
    callbacks: AudioTranscriptionPipelineCallbacks,
  ): void {
    if (!partial) {
      return;
    }

    /*
     * The final event is handled from the resolved
     * TranscriptionResult.
     *
     * Therefore only non-final events are assembled here.
     */
    if (partial.isFinal) {
      return;
    }

    const relativeTimestamp = this.toRelativeTimestamp(partial.timestamp);

    const snapshot = this.assembler.addPartial(
      partial,
      relativeTimestamp,
      relativeTimestamp,
    );

    callbacks.onPartial?.(snapshot, partial);

    /*
     * sessionId is intentionally accepted by this method because the
     * callback belongs to the active audio session.
     *
     * Conversation publication does not happen here.
     */
    void sessionId;
  }

  // ==========================================================================
  // FINAL PUBLICATION
  // ==========================================================================

  /**
   * Publish finalized internal transcript entries into the shared
   * audio transcript boundary.
   *
   * Only finalized, non-empty entries are accepted.
   */
  private publishFinalEntries(
    entries: readonly TranscriptEntry[],
    sessionId: UUID,
  ): readonly PublishedAudioTranscript[] {
    const finalized = entries.filter(
      (entry) => entry.isFinal && entry.text.trim().length > 0,
    );

    if (finalized.length === 0) {
      return Object.freeze([]);
    }

    return this.publisher.publishMany(finalized, sessionId);
  }

  // ==========================================================================
  // SESSION
  // ==========================================================================

  private beginSession(sessionId: UUID): void {
    if (!sessionId || !sessionId.trim()) {
      throw new Error("Audio transcription sessionId is required.");
    }

    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      throw new Error(
        `AudioTranscriptionPipeline is already processing session "${this.activeSessionId}".`,
      );
    }

    this.activeSessionId = sessionId;
  }

  /**
   * Clear all pipeline state associated with one session.
   *
   * TranscriptAssembler.clear() also resets the finalized-entry
   * consumption cursor.
   */
  public clearSession(sessionId: UUID): void {
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = undefined;
    }

    this.assembler.clear();

    this.publisher.clearSession(sessionId);
  }

  public getSnapshot(): TranscriptSnapshot {
    return this.assembler.getSnapshot();
  }

  public getConversationBridge(): AudioTranscriptPublisher["getBridge"] extends (
    ...args: never[]
  ) => infer TResult
    ? TResult
    : never {
    return this.publisher.getBridge();
  }

  // ==========================================================================
  // TIMESTAMP
  // ==========================================================================

  private toRelativeTimestamp(timestamp: number): number {
    if (!Number.isFinite(timestamp)) {
      throw new Error("Transcription timestamp must be finite.");
    }

    if (this.sessionStartedAt === undefined) {
      return Math.max(0, timestamp);
    }

    return Math.max(0, timestamp - this.sessionStartedAt);
  }

  private getRelativeStartTime(result: TranscriptionResult): number {
    /*
     * A transcription result currently does not expose an authoritative
     * start timestamp.
     *
     * The pipeline therefore starts the result at zero relative to the
     * current transcription window.
     */
    void result;

    return 0;
  }

  private getRelativeEndTime(result: TranscriptionResult): number {
    return Math.max(0, result.durationMs ?? 0);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function validateOptionalTimestamp(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite timestamp.`);
  }

  return value;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
