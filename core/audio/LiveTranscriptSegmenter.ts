// ============================================================================
// FILE: core/audio/LiveTranscriptSegmenter.ts
// PURPOSE:
// Bounded transcript assembly and segmentation for live audio.
//
// RESPONSIBILITY:
// - Wrap TranscriptAssembler to accumulate partial and final transcript text.
// - Emit finalized segments with stable ordering, timestamps, and optional
//   speaker id.
// - Deduplicate consecutive identical segments within a time window.
// - Bound memory usage so long live sessions do not grow unboundedly.
// - Convert capture-relative timestamps into absolute session timestamps.
//
// ARCHITECTURAL RULE:
// This file is part of core/audio. It does NOT implement capture,
// transcription, conversation analysis, or interview intelligence. It only
// shapes the transcript stream that feeds those subsystems.
// ============================================================================

import type { PartialTranscription, TranscriptionResult } from "./TranscriptionEngine";

import {
  TranscriptAssembler,
  type TranscriptEntry,
  type TranscriptSnapshot,
} from "./TranscriptAssembler";

// ============================================================================
// TYPES
// ============================================================================

export interface LiveTranscriptSegmenterOptions {
  /**
   * Absolute epoch ms when the audio session started.
   *
   * Capture-relative entry times are offset by this to produce stable
   * absolute timestamps.
   */
  readonly sessionStartedAt?: number;

  /**
   * Maximum number of finalized entries retained in the queue.
   *
   * Older entries are dropped once the limit is exceeded.
   * Default: 500.
   */
  readonly maxEntries?: number;

  /**
   * Window (ms) within which a repeated final segment is treated as a
   * duplicate and suppressed.
   * Default: 2000.
   */
  readonly duplicateWindowMs?: number;
}

export interface FinalizedTranscriptSegment {
  readonly id: string;

  readonly text: string;

  /**
   * Absolute epoch ms when the segment started.
   */
  readonly startedAt: number;

  /**
   * Absolute epoch ms when the segment ended.
   */
  readonly endedAt: number;

  readonly speakerId?: string;

  readonly confidence?: number;

  readonly isFinal: true;
}

// ============================================================================
// SEGMENTER
// ============================================================================

export class LiveTranscriptSegmenter {
  private readonly assembler = new TranscriptAssembler();

  private readonly sessionStartedAt: number;

  private readonly maxEntries: number;

  private readonly duplicateWindowMs: number;

  private readonly queue: FinalizedTranscriptSegment[] = [];

  private publishedFinalCount = 0;

  private lastFinalText = "";

  private lastFinalTime = 0;

  public constructor(options: LiveTranscriptSegmenterOptions = {}) {
    this.sessionStartedAt = options.sessionStartedAt ?? Date.now();
    this.maxEntries = Math.max(1, options.maxEntries ?? 500);
    this.duplicateWindowMs = Math.max(0, options.duplicateWindowMs ?? 2_000);
  }

  // =========================================================================
  // PARTIAL (non-final, not persisted to final queue)
  // =========================================================================

  public addPartial(
    partial: PartialTranscription,
    startTime = partial.timestamp,
    endTime = partial.timestamp,
    speakerId?: string,
  ): TranscriptSnapshot {
    return this.assembler.addPartial(partial, startTime, endTime, speakerId);
  }

  // =========================================================================
  // FINAL
  // =========================================================================

  public addFinal(
    result: TranscriptionResult,
    startTime: number,
    endTime: number,
    speakerId?: string,
  ): TranscriptSnapshot {
    const snapshot = this.assembler.addFinal(result, startTime, endTime, speakerId);
    const entries = this.takeNewFinalEntries(snapshot);
    for (const entry of entries) {
      this.enqueueFinal(entry);
    }
    return snapshot;
  }

  // =========================================================================
  // QUEUE ACCESS
  // =========================================================================

  /**
   * Take and remove all finalized segments queued since the last call.
   *
   * Each segment is returned exactly once per segmenter lifecycle.
   */
  public takeFinalEntries(): readonly FinalizedTranscriptSegment[] {
    const taken = [...this.queue];
    this.queue.length = 0;
    return Object.freeze(taken);
  }

  public getSnapshot(): TranscriptSnapshot {
    return this.assembler.getSnapshot();
  }

  public getEntryCount(): number {
    return this.queue.length;
  }

  // =========================================================================
  // PRIVATE
  // =========================================================================

  private takeNewFinalEntries(snapshot: TranscriptSnapshot): readonly TranscriptEntry[] {
    // Only entries appended since the last addFinal call are new. The
    // assembler appends exactly one final entry per addFinal call, so a
    // count cursor guarantees each finalized entry is enqueued once.
    const news = snapshot.entries.slice(this.publishedFinalCount);
    this.publishedFinalCount = snapshot.entries.length;
    return news.filter((entry) => entry.isFinal);
  }

  private enqueueFinal(entry: TranscriptEntry): void {
    const now = Date.now();
    const isDuplicate =
      entry.text === this.lastFinalText &&
      now - this.lastFinalTime < this.duplicateWindowMs;

    if (isDuplicate) {
      return;
    }

    const segment: FinalizedTranscriptSegment = {
      id: entry.id,
      text: entry.text,
      startedAt: this.sessionStartedAt + entry.startTime,
      endedAt: this.sessionStartedAt + entry.endTime,
      speakerId: entry.speakerId,
      confidence: entry.confidence,
      isFinal: true,
    };

    this.queue.push(segment);

    if (this.queue.length > this.maxEntries) {
      this.queue.shift();
    }

    this.lastFinalText = entry.text;
    this.lastFinalTime = now;
  }
}
