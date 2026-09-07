// core/audio/TranscriptAssembler.ts

import type {
  PartialTranscription,
  TranscriptionResult,
} from "./TranscriptionEngine";

export interface TranscriptEntry {
  readonly id: string;
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly speakerId?: string;
  readonly confidence?: number;
  readonly isFinal: boolean;
}

export interface TranscriptSnapshot {
  readonly entries: readonly TranscriptEntry[];
  readonly text: string;
}

export class TranscriptAssembler {
  private readonly entries: TranscriptEntry[] = [];

  private currentPartial?: TranscriptEntry;

  public addPartial(
    partial: PartialTranscription,
    startTime = partial.timestamp,
    endTime = partial.timestamp,
    speakerId?: string,
  ): TranscriptSnapshot {
    const entry: TranscriptEntry = {
      id: this.currentPartial?.id ?? createId(),
      text: cleanTranscript(partial.text),
      startTime,
      endTime,
      speakerId,
      confidence: partial.confidence,
      isFinal: partial.isFinal,
    };

    if (partial.isFinal) {
      if (this.currentPartial) {
        this.replacePartial(this.currentPartial.id, entry);
        this.currentPartial = undefined;
      } else {
        this.entries.push(entry);
      }
    } else {
      this.currentPartial = entry;
    }

    return this.snapshot();
  }

  public addFinal(
    result: TranscriptionResult,
    startTime: number,
    endTime: number,
    speakerId?: string,
  ): TranscriptSnapshot {
    const entry: TranscriptEntry = {
      id: createId(),
      text: cleanTranscript(result.text),
      startTime,
      endTime,
      speakerId,
      confidence: result.confidence,
      isFinal: true,
    };

    if (entry.text.length > 0) {
      this.entries.push(entry);
    }

    this.currentPartial = undefined;

    return this.snapshot();
  }

  public getSnapshot(): TranscriptSnapshot {
    return this.snapshot();
  }

  public getEntries(): readonly TranscriptEntry[] {
    return this.entries.slice();
  }

  public getText(): string {
    return this.buildText();
  }

  public clear(): void {
    this.entries.length = 0;
    this.currentPartial = undefined;
  }

  public reset(): void {
    this.clear();
  }

  private replacePartial(id: string, entry: TranscriptEntry): void {
    const index = this.entries.findIndex((candidate) => candidate.id === id);

    if (index >= 0) {
      this.entries[index] = entry;
      return;
    }

    this.entries.push(entry);
  }

  private snapshot(): TranscriptSnapshot {
    const entries = this.currentPartial
      ? [...this.entries, this.currentPartial]
      : this.entries.slice();

    return {
      entries,
      text: buildText(entries),
    };
  }

  private buildText(): string {
    return buildText(
      this.currentPartial
        ? [...this.entries, this.currentPartial]
        : this.entries,
    );
  }
}

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

function createId(): string {
  return `transcript-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
