// ============================================================================
// FILE: core/audio/AudioTranscriptionPipeline.ts
//
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
//   shared AudioTranscriptSegment
//       ├──────────────────────────────┐
//       │                              │
//       ▼                              ▼
//   Conversation                 AudioContextPublisher
//       │                              │
//       ▼                              ▼
// ConversationManager            ContextManager
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
// - implement Context embeddings
// - implement vector storage
//
// Each subsystem remains responsible for its own domain.
//
// ARCHITECTURAL BOUNDARIES:
//
//     core/audio
//          ↓
//     shared/types/audio
//          ↓
//     core/conversation
//
// and independently:
//
//     core/audio
//          ↓
//     shared/types/audio
//          ↓
//     AudioContextPublisher
//          ↓
//     core/context
//
// core/context never imports core/audio.
// ============================================================================

import type { UUID } from "../../shared/types/common";

import type { ConversationAnalysis } from "../../shared/types/conversation";

import type { ContextScope } from "../context/contracts/ContextTypes";

import type { AudioTranscriptSegment } from "../../shared/types/audio";

// ============================================================================
// IMPORTANT ARCHITECTURAL TYPE IMPORT
// ============================================================================
//
// AudioTranscriptionPipeline exposes the existing audio → conversation
// boundary through getConversationBridge().
//
// The bridge itself belongs to core/conversation, not core/audio.
//
// Therefore this is a TYPE-ONLY dependency:
//
//     core/audio
//          ↓
//     AudioConversationBridge
//          ↓
//     core/conversation
//
// This does not move conversation logic into the audio subsystem.
// ============================================================================

import type { AudioConversationBridge } from "../conversation/adapters/AudioConversationBridge";

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

import {
  AudioContextPublisher,
  type AudioContextPublisherOptions,
  type PublishedAudioContext,
} from "./AudioContextPublisher";

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
   * into authoritative relative timestamps from the session start.
   */
  readonly sessionStartedAt?: number;

  /**
   * Optional Context Manager.
   *
   * When supplied, finalized shared audio transcript segments are indexed
   * into the generic Context subsystem.
   *
   * The ContextManager is intentionally injected rather than constructed
   * inside the audio subsystem.
   */
  readonly contextManager?: AudioContextPublisherOptions["contextManager"];

  /**
   * Optional Context scope inherited from the active application flow.
   *
   * The active audio sessionId is always added automatically.
   */
  readonly contextScope?: ContextScope;

  /**
   * Additional Context metadata for audio transcript records.
   */
  readonly contextMetadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// CALLBACKS
// ============================================================================

export interface AudioTranscriptionPipelineCallbacks {
  /**
   * Called whenever a partial transcription is produced.
   *
   * Partial results never enter conversation memory or Context.
   */
  readonly onPartial?: (
    snapshot: TranscriptSnapshot,
    partial: PartialTranscription,
  ) => void;

  /**
   * Called when a finalized transcript enters the shared audio boundary
   * and is then forwarded to conversation.
   */
  readonly onFinal?: (
    published: PublishedAudioTranscript,
    snapshot: TranscriptSnapshot,
  ) => void;

  /**
   * Called when a finalized transcript is successfully indexed into Context.
   */
  readonly onContextIndexed?: (
    published: PublishedAudioContext,
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

  /**
   * Shared audio transcript publications.
   *
   * These are the existing audio → shared → conversation results.
   */
  readonly published: readonly PublishedAudioTranscript[];

  /**
   * Context indexing results.
   *
   * These are the new audio → shared → Context results.
   */
  readonly contextPublished: readonly PublishedAudioContext[];

  /**
   * Conversation analyses generated by the existing audio → conversation
   * Stage B bridge.
   */
  readonly analyses: readonly ConversationAnalysis[];
}

// ============================================================================
// PIPELINE
// ============================================================================

export class AudioTranscriptionPipeline {
  private readonly engine: TranscriptionEngine;

  private readonly assembler: TranscriptAssembler;

  private readonly publisher: AudioTranscriptPublisher;

  private readonly contextPublisher?: AudioContextPublisher;

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

    // =========================================================================
    // Existing audio → shared → conversation path.
    // =========================================================================
    this.publisher = new AudioTranscriptPublisher(options);

    // =========================================================================
    // New audio → shared → Context path.
    //
    // Context is injected from the composition layer.
    //
    // We do not construct ContextManager here because ContextManager owns
    // embeddings, vector storage, retrieval and ranking infrastructure.
    // =========================================================================
    if (options.contextManager) {
      this.contextPublisher = new AudioContextPublisher({
        contextManager: options.contextManager,

        scope: options.contextScope,

        metadata: options.contextMetadata,
      });
    }

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
   * Provider partials update the internal transcript snapshot only.
   *
   * They are NOT:
   *
   * - sent to conversation memory
   * - indexed into Context
   *
   * The resolved TranscriptionResult is authoritative.
   */
  public async transcribeStream(
    sessionId: UUID,
    request: TranscriptionRequest,
    callbacks: AudioTranscriptionPipelineCallbacks = {},
  ): Promise<AudioTranscriptionPipelineResult> {
    this.beginSession(sessionId);

    const published: PublishedAudioTranscript[] = [];

    const contextPublished: PublishedAudioContext[] = [];

    try {
      const result = await this.engine.transcribeStream(request, (partial) => {
        this.handlePartial(partial, sessionId, callbacks);
      });

      // =======================================================================
      // The resolved transcription result is authoritative.
      //
      // We intentionally do not use a provider final-partial event as the
      // source of truth.
      // =======================================================================

      this.assembler.addFinal(
        result,
        this.getRelativeStartTime(result),
        this.getRelativeEndTime(result),
      );

      // =======================================================================
      // Consume only newly finalized entries.
      // =======================================================================

      const finalEntries = this.assembler.takeFinalEntries();

      const snapshot = this.assembler.getSnapshot();

      // =======================================================================
      // Existing Stage B:
      //
      // TranscriptEntry
      //      ↓
      // AudioTranscriptPublisher
      //      ↓
      // shared AudioTranscriptSegment
      //      ↓
      // AudioConversationBridge
      // =======================================================================

      const finalPublished = this.publishFinalEntries(finalEntries, sessionId);

      published.push(...finalPublished);

      // =======================================================================
      // New Context path:
      //
      // PublishedAudioTranscript.segment
      //      ↓
      // shared AudioTranscriptSegment
      //      ↓
      // AudioContextPublisher
      //      ↓
      // ContextManager
      // =======================================================================

      const finalContextPublished = await this.publishToContext(finalPublished);

      contextPublished.push(...finalContextPublished);

      for (const item of finalPublished) {
        callbacks.onFinal?.(item, snapshot);
      }

      for (const item of finalContextPublished) {
        callbacks.onContextIndexed?.(item, snapshot);
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

        contextPublished: Object.freeze(contextPublished.slice()),

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
   * The resulting transcription is finalized and forwarded through:
   *
   *     audio → shared → conversation
   *
   * and, when configured:
   *
   *     audio → shared → Context
   */
  public async transcribe(
    sessionId: UUID,
    request: TranscriptionRequest,
    callbacks: AudioTranscriptionPipelineCallbacks = {},
  ): Promise<AudioTranscriptionPipelineResult> {
    this.beginSession(sessionId);

    try {
      const result = await this.engine.transcribe(request);

      // =======================================================================
      // Add the authoritative final result.
      // =======================================================================

      this.assembler.addFinal(
        result,
        this.getRelativeStartTime(result),
        this.getRelativeEndTime(result),
      );

      // =======================================================================
      // Consume only newly finalized entries.
      // =======================================================================

      const finalEntries = this.assembler.takeFinalEntries();

      const snapshot = this.assembler.getSnapshot();

      // =======================================================================
      // Existing Stage B.
      // =======================================================================

      const published = this.publishFinalEntries(finalEntries, sessionId);

      // =======================================================================
      // New Context connection.
      // =======================================================================

      const contextPublished = await this.publishToContext(published);

      for (const item of published) {
        callbacks.onFinal?.(item, snapshot);
      }

      for (const item of contextPublished) {
        callbacks.onContextIndexed?.(item, snapshot);
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

        contextPublished,

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

    // =========================================================================
    // Final provider events are deliberately ignored here.
    //
    // The resolved TranscriptionResult remains authoritative.
    // =========================================================================

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

    // =========================================================================
    // Session identity is represented by the pipeline's active session.
    //
    // It is intentionally not written into conversation or Context from
    // partial events.
    // =========================================================================

    void sessionId;
  }

  // ==========================================================================
  // EXISTING SHARED AUDIO PUBLICATION
  // ==========================================================================

  /**
   * Publish finalized internal transcript entries through the existing
   * audio → shared → conversation boundary.
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
  // NEW CONTEXT PUBLICATION
  // ==========================================================================

  /**
   * Publish finalized shared audio transcript segments into Context.
   *
   * IMPORTANT:
   *
   * This method consumes the shared representation returned by
   * AudioTranscriptPublisher.
   *
   * It does NOT reconstruct AudioTranscriptSegment from TranscriptEntry.
   *
   * This ensures the shared layer remains the canonical boundary.
   */
  private async publishToContext(
    published: readonly PublishedAudioTranscript[],
  ): Promise<readonly PublishedAudioContext[]> {
    if (!this.contextPublisher) {
      return Object.freeze([]);
    }

    if (published.length === 0) {
      return Object.freeze([]);
    }

    const segments: AudioTranscriptSegment[] = published
      .map((item) => item.segment)
      .filter(
        (segment): segment is AudioTranscriptSegment =>
          segment.isFinal && segment.text.trim().length > 0,
      );

    if (segments.length === 0) {
      return Object.freeze([]);
    }

    return this.contextPublisher.publishMany(segments);
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
   * Clear transient pipeline state associated with one session.
   *
   * IMPORTANT:
   *
   * This does NOT remove Context records.
   *
   * Once an audio transcript has entered Context it represents searchable
   * contextual knowledge and should remain there until the owning
   * Context lifecycle explicitly removes it.
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

  /**
   * Existing conversation bridge.
   *
   * The bridge belongs to core/conversation.
   *
   * AudioTranscriptionPipeline only exposes the boundary that is already
   * owned by AudioTranscriptPublisher.
   */
  public getConversationBridge(): AudioConversationBridge {
    return this.publisher.getBridge();
  }

  /**
   * Context manager used by the audio Context adapter.
   *
   * Returns undefined when Context integration was not configured.
   */
  public getContextManager():
    ReturnType<AudioContextPublisher["getContextManager"]> | undefined {
    return this.contextPublisher?.getContextManager();
  }

  /**
   * Explicit Context integration state.
   */
  public isContextIntegrationEnabled(): boolean {
    return this.contextPublisher !== undefined;
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
    /**
     * TranscriptionResult currently does not expose an authoritative
     * start timestamp.
     *
     * Therefore the transcription window begins at zero relative time.
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
