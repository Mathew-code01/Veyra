// ============================================================================
// FILE: core/audio/AudioTranscriptPublisher.ts
// PURPOSE:
// Convert finalized internal audio transcript entries into the canonical
// shared AudioTranscriptSegment contract and publish them to the
// conversation boundary.
//
// ARCHITECTURE:
//
//   TranscriptAssembler
//          │
//          ▼
//   TranscriptEntry
//          │
//          ▼
//   AudioTranscriptPublisher
//          │
//          ▼
//   shared AudioTranscriptSegment
//          │
//          ▼
//   AudioConversationBridge
//
// IMPORTANT:
//
// This file is the explicit boundary between the internal audio domain and
// the conversation domain.
//
// Audio does NOT import ConversationManager directly.
//
// The only conversation dependency here is the already-defined adapter:
// AudioConversationBridge.
//
// This keeps the architecture:
//
//   audio → adapter → conversation
//
// rather than:
//
//   audio → conversation internals
// ============================================================================

import type { AudioTranscriptSegment } from "../../shared/types/audio";
import type { UUID } from "../../shared/types/common";

import type { ConversationAnalysis } from "../../shared/types/conversation";

import type { TranscriptEntry } from "./TranscriptAssembler";

import {
  AudioConversationBridge,
  type AudioConversationBridgeOptions,
} from "../conversation/adapters/AudioConversationBridge";

// ============================================================================
// OPTIONS
// ============================================================================

export interface AudioTranscriptPublisherOptions extends AudioConversationBridgeOptions {
  /**
   * Provider name associated with the transcription source.
   *
   * Example:
   *
   *   "whisper"
   *   "whisper.cpp"
   *   "faster-whisper"
   *
   * Optional because the audio assembler itself does not require provider
   * metadata.
   */
  readonly provider?: string;

  /**
   * Model name associated with the transcription source.
   */
  readonly model?: string;

  /**
   * Language detected or configured for transcription.
   */
  readonly language?: string;

  /**
   * Clock used when the internal transcript entry needs an absolute
   * ISO timestamp.
   *
   * Defaults to Date.now.
   */
  readonly now?: () => number;
}

// ============================================================================
// RESULT
// ============================================================================

export interface PublishedAudioTranscript {
  /**
   * Canonical shared audio transcript event.
   */
  readonly segment: AudioTranscriptSegment;

  /**
   * Conversation analysis produced from the finalized segment.
   */
  readonly analysis?: ConversationAnalysis;
}

// ============================================================================
// PUBLISHER
// ============================================================================

export class AudioTranscriptPublisher {
  private readonly bridge: AudioConversationBridge;

  private readonly provider?: string;

  private readonly model?: string;

  private readonly language?: string;

  private readonly now: () => number;

  public constructor(options: AudioTranscriptPublisherOptions = {}) {
    this.bridge = new AudioConversationBridge(options);

    this.provider = normalizeOptionalString(options.provider);

    this.model = normalizeOptionalString(options.model);

    this.language = normalizeOptionalString(options.language);

    this.now = options.now ?? Date.now;
  }

  /**
   * Publish one finalized internal transcript entry.
   *
   * Only finalized entries are allowed across the conversation boundary.
   */
  public publish(
    entry: TranscriptEntry,
    sessionId: UUID,
    signal?: AbortSignal,
  ): PublishedAudioTranscript | undefined {
    if (!entry) {
      throw new Error("Audio transcript entry is required.");
    }

    if (!sessionId) {
      throw new Error("Audio transcript sessionId is required.");
    }

    if (!entry.isFinal) {
      return undefined;
    }

    const segment = this.toSharedSegment(entry, sessionId);

    const analysis = this.bridge.process(segment, signal);

    return {
      segment,
      analysis,
    };
  }

  /**
   * Publish multiple finalized entries in chronological order.
   *
   * Non-final entries are ignored.
   */
  public publishMany(
    entries: readonly TranscriptEntry[],
    sessionId: UUID,
    signal?: AbortSignal,
  ): readonly PublishedAudioTranscript[] {
    if (!Array.isArray(entries)) {
      throw new Error("Audio transcript entries must be an array.");
    }

    const published: PublishedAudioTranscript[] = [];

    for (const entry of entries) {
      if (!entry.isFinal) {
        continue;
      }

      const result = this.publish(entry, sessionId, signal);

      if (result) {
        published.push(result);
      }
    }

    return Object.freeze(published);
  }

  /**
   * Access the underlying conversation bridge for lifecycle operations.
   */
  public getBridge(): AudioConversationBridge {
    return this.bridge;
  }

  /**
   * Clear conversation memory for one audio session.
   */
  public clearSession(sessionId: UUID): void {
    this.bridge.clear(sessionId);
  }

  /**
   * Clear all conversation sessions managed by the bridge.
   */
  public clearAll(): void {
    this.bridge.getManager().clearAll();
  }

  // ==========================================================================
  // MAPPING
  // ==========================================================================

  private toSharedSegment(
    entry: TranscriptEntry,
    sessionId: UUID,
  ): AudioTranscriptSegment {
    const startedAt = new Date(
      this.resolveAbsoluteTimestamp(entry.startTime),
    ).toISOString();

    const endedAt = new Date(
      this.resolveAbsoluteTimestamp(entry.endTime),
    ).toISOString();

    return {
      id: normalizeTranscriptId(entry.id),

      sessionId,

      text: entry.text.trim(),

      speakerId: normalizeOptionalString(entry.speakerId),

      startedAt,

      endedAt,

      confidence: entry.confidence,

      isFinal: true,

      source: "audio",

      provider: this.provider,

      model: this.model,

      language: this.language,
    };
  }

  /**
   * TranscriptAssembler timestamps are runtime/capture-relative.
   *
   * The assembler intentionally does not own wall-clock timestamps.
   *
   * For now we anchor the transcript entry to the current clock while
   * preserving the relative duration encoded by the entry.
   *
   * A future capture session can provide a real session start timestamp
   * without changing the shared boundary.
   */
  private resolveAbsoluteTimestamp(relativeMs: number): number {
    if (!Number.isFinite(relativeMs) || relativeMs < 0) {
      throw new Error(
        "Audio transcript timestamp must be a finite non-negative number.",
      );
    }

    const now = this.now();

    if (!Number.isFinite(now)) {
      throw new Error("Audio transcript clock returned an invalid timestamp.");
    }

    return now + relativeMs;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeOptionalString(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTranscriptId(id: string): UUID {
  const normalized = id.trim();

  if (!normalized) {
    throw new Error("Audio transcript entry id cannot be empty.");
  }

  return normalized as UUID;
}
