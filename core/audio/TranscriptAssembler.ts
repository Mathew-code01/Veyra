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
// Stage B will map this representation into the shared/conversation
// boundary.
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
  private readonly entries: TranscriptEntry[] = [];

  private currentPartial?: TranscriptEntry;

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

  public addFinal(
    result: TranscriptionResult,
    startTime: number,
    endTime: number,
    speakerId?: string,
  ): TranscriptSnapshot {
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

  public getSnapshot(): TranscriptSnapshot {
    return this.snapshot();
  }

  public getEntries(): readonly TranscriptEntry[] {
    return this.entries.slice();
  }

  public getText(): string {
    return buildText(this.getVisibleEntries());
  }

  // ==========================================================================
  // RESET
  // ==========================================================================

  public clear(): void {
    this.entries.length = 0;

    this.currentPartial = undefined;
  }

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
