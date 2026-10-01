// ============================================================================
// FILE: core/audio/TranscriptAssembler.ts
// PURPOSE:
// Assemble partial and final transcription results into a stable
// internal transcript snapshot.
//
// IMPORTANT:
// TranscriptEntry is an INTERNAL audio representation.
//
// It is NOT the canonical conversation transcript contract.
// Stage B maps this representation into the shared/conversation boundary.
//
// DOWNSTREAM CONSUMPTION:
//
//   TranscriptAssembler
//          │
//          ├── partial transcript → getSnapshot()
//          │
//          └── finalized entries → takeFinalEntries()
//                                      │
//                                      ▼
//                           AudioTranscriptPublisher
//                                      │
//                                      ▼
//                           AudioConversationBridge
//                                      │
//                                      ▼
//                             ConversationManager
//
// The assembler deliberately does not know about conversation.
// ============================================================================

import type {
  PartialTranscription,
  TranscriptionResult,
} from "./TranscriptionEngine";

// ============================================================================
// TYPES
// ============================================================================

export interface TranscriptEntry {
  readonly id: string;

  readonly text: string;

  /**
   * Capture-relative or runtime-relative timestamp.
   *
   * Unit: milliseconds.
   */
  readonly startTime: number;

  /**
   * Capture-relative or runtime-relative timestamp.
   *
   * Unit: milliseconds.
   */
  readonly endTime: number;

  /**
   * Optional provider/domain speaker identifier.
   *
   * Audio does not impose interviewer/candidate semantics here.
   */
  readonly speakerId?: string;

  readonly confidence?: number;

  readonly isFinal: boolean;
}

export interface TranscriptSnapshot {
  readonly entries: readonly TranscriptEntry[];

  readonly text: string;
}

// ============================================================================
// ASSEMBLER
// ============================================================================

export class TranscriptAssembler {
  /**
   * Finalized transcript entries.
   *
   * Partial transcript state is kept separately in currentPartial.
   */
  private readonly entries: TranscriptEntry[] = [];

  /**
   * Currently active non-final transcript.
   *
   * Only one active partial is maintained at a time.
   */
  private currentPartial?: TranscriptEntry;

  /**
   * Number of finalized entries already consumed by a downstream publisher.
   *
   * This is intentionally an internal cursor.
   *
   * The assembler does NOT know who consumes these entries.
   *
   * It only guarantees that takeFinalEntries() returns each finalized
   * entry once per assembler lifecycle.
   */
  private publishedFinalEntryCount = 0;

  // ==========================================================================
  // PARTIAL
  // ==========================================================================

  /**
   * Add or replace the current partial transcript.
   *
   * Only one active partial segment is maintained at a time.
   */
  public addPartial(
    partial: PartialTranscription,
    startTime = partial.timestamp,
    endTime = partial.timestamp,
    speakerId?: string,
  ): TranscriptSnapshot {
    if (!partial) {
      throw new Error("Transcript partial is required.");
    }

    validateTimestamp(startTime, "startTime");

    validateTimestamp(endTime, "endTime");

    if (endTime < startTime) {
      throw new Error("Transcript endTime cannot be earlier than startTime.");
    }

    const text = cleanTranscript(partial.text);

    const entry: TranscriptEntry = {
      id: this.currentPartial?.id ?? createTranscriptId(),

      text,

      startTime,

      endTime,

      speakerId,

      confidence: normalizeConfidence(partial.confidence),

      isFinal: partial.isFinal,
    };

    /*
     * A final partial is a completed transcript segment.
     *
     * Normally AudioTranscriptionPipeline deliberately does not send
     * final partial events here because the resolved TranscriptionResult
     * is treated as authoritative.
     *
     * Keeping this behavior here makes TranscriptAssembler independently
     * safe if another caller uses it directly.
     */
    if (partial.isFinal) {
      this.commitFinalEntry(entry);

      this.currentPartial = undefined;
    } else {
      /*
       * Empty partials are still represented internally because
       * the provider may subsequently populate them.
       */
      this.currentPartial = entry;
    }

    return this.snapshot();
  }

  // ==========================================================================
  // FINAL RESULT
  // ==========================================================================

  /**
   * Add a finalized transcription result.
   *
   * IMPORTANT:
   *
   * This method returns a TranscriptSnapshot, not a TranscriptEntry.
   *
   * Consumers that need to publish newly finalized entries should call:
   *
   *     takeFinalEntries()
   *
   * after calling addFinal().
   */
  public addFinal(
    result: TranscriptionResult,
    startTime: number,
    endTime: number,
    speakerId?: string,
  ): TranscriptSnapshot {
    if (!result) {
      throw new Error("Transcript result is required.");
    }

    validateTimestamp(startTime, "startTime");

    validateTimestamp(endTime, "endTime");

    if (endTime < startTime) {
      throw new Error("Transcript endTime cannot be earlier than startTime.");
    }

    const text = cleanTranscript(result.text);

    /*
     * A final result with no usable text should not create an empty
     * transcript segment.
     */
    if (text.length > 0) {
      const entry: TranscriptEntry = {
        id: createTranscriptId(),

        text,

        startTime,

        endTime,

        speakerId,

        confidence: normalizeConfidence(result.confidence),

        isFinal: true,
      };

      this.commitFinalEntry(entry);
    }

    this.currentPartial = undefined;

    return this.snapshot();
  }

  // ==========================================================================
  // SNAPSHOT
  // ==========================================================================

  /**
   * Return the current transcript snapshot.
   *
   * Includes finalized entries and the current partial, if one exists.
   */
  public getSnapshot(): TranscriptSnapshot {
    return this.snapshot();
  }

  /**
   * Return all finalized entries currently held by the assembler.
   *
   * The returned array is a defensive copy.
   *
   * IMPORTANT:
   *
   * This does NOT consume entries.
   *
   * Use takeFinalEntries() when handing finalized entries to a
   * downstream integration.
   */
  public getEntries(): readonly TranscriptEntry[] {
    return this.entries.slice();
  }

  /**
   * Return finalized transcript entries only.
   *
   * The returned array is a defensive copy.
   *
   * This intentionally excludes the currently active partial transcript.
   */
  public getFinalEntries(): readonly TranscriptEntry[] {
    return this.entries.slice();
  }

  /**
   * Return finalized entries that have not yet been consumed by a
   * downstream integration.
   *
   * This creates a one-way consumption cursor without coupling the
   * assembler to conversation or any other subsystem.
   *
   * Example:
   *
   *     entries: [A, B, C]
   *     cursor:  2
   *
   *     takeFinalEntries()
   *       → [C]
   *
   *     cursor becomes 3.
   *
   * A subsequent call returns [].
   */
  public takeFinalEntries(): readonly TranscriptEntry[] {
    if (this.publishedFinalEntryCount >= this.entries.length) {
      return Object.freeze([]);
    }

    const entries = this.entries.slice(this.publishedFinalEntryCount);

    this.publishedFinalEntryCount = this.entries.length;

    return Object.freeze(entries);
  }

  /**
   * Return the complete visible transcript text.
   *
   * Includes the current partial transcript when present.
   */
  public getText(): string {
    return buildText(this.getVisibleEntries());
  }

  // ==========================================================================
  // RESET
  // ==========================================================================

  /**
   * Clear the assembler completely.
   *
   * The finalized-entry consumption cursor must also be reset.
   */
  public clear(): void {
    this.entries.length = 0;

    this.currentPartial = undefined;

    this.publishedFinalEntryCount = 0;
  }

  /**
   * Alias for clear().
   */
  public reset(): void {
    this.clear();
  }

  // ==========================================================================
  // INTERNAL
  // ==========================================================================

  private commitFinalEntry(entry: TranscriptEntry): void {
    /*
     * Avoid inserting empty final entries.
     */
    if (entry.text.length === 0) {
      return;
    }

    this.entries.push(entry);
  }

  private getVisibleEntries(): readonly TranscriptEntry[] {
    if (!this.currentPartial) {
      return this.entries.slice();
    }

    return [...this.entries, this.currentPartial];
  }

  private snapshot(): TranscriptSnapshot {
    const entries = this.getVisibleEntries();

    return Object.freeze({
      entries: Object.freeze(
        entries.map((entry) =>
          Object.freeze({
            ...entry,
          }),
        ),
      ),

      text: buildText(entries),
    });
  }
}

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

function buildText(entries: readonly TranscriptEntry[]): string {
  return entries
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTranscript(text: string): string {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Transcript ${name} must be a finite non-negative number.`);
  }
}

function normalizeConfidence(
  confidence: number | undefined,
): number | undefined {
  if (confidence == null) {
    return undefined;
  }

  if (!Number.isFinite(confidence)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, confidence));
}

// ============================================================================
// ID
// ============================================================================

function createTranscriptId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `transcript-${uuid}`;
}
