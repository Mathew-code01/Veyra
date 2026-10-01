import type { AudioTranscriptSegment } from "../../../shared/types/audio";

import type {
  SpeakerRole,
  TranscriptSegment,
} from "../../../shared/types/conversation";

export interface AudioTranscriptMapperOptions {
  /**
   * Maps audio/diarization speaker IDs to generic conversation roles.
   *
   * Example:
   *
   * {
   *   "speaker-1": "participant",
   *   "assistant": "assistant"
   * }
   *
   * Interview-specific mappings should NOT be hardcoded here.
   */
  readonly speakerRolesById?: Readonly<Record<string, SpeakerRole>>;

  /**
   * Safe generic default for microphone conversations.
   */
  readonly defaultSpeaker?: SpeakerRole;
}

export class AudioTranscriptMapper {
  private readonly speakerRolesById: Readonly<Record<string, SpeakerRole>>;

  private readonly defaultSpeaker: SpeakerRole;

  constructor(options: AudioTranscriptMapperOptions = {}) {
    this.speakerRolesById = options.speakerRolesById ?? {};

    this.defaultSpeaker = options.defaultSpeaker ?? "participant";
  }

  map(segment: AudioTranscriptSegment): TranscriptSegment {
    const startMs = Date.parse(segment.startedAt);

    const endMs = Date.parse(segment.endedAt);

    if (!Number.isFinite(startMs)) {
      throw new Error(
        "Audio transcript startedAt is not a valid ISO timestamp.",
      );
    }

    if (!Number.isFinite(endMs)) {
      throw new Error("Audio transcript endedAt is not a valid ISO timestamp.");
    }

    if (endMs < startMs) {
      throw new Error(
        "Audio transcript endedAt cannot be earlier than startedAt.",
      );
    }

    const text = segment.text.trim();

    if (!text) {
      throw new Error("Cannot map an empty audio transcript segment.");
    }

    return {
      /**
       * The shared audio segment ID is already the cross-domain
       * identity of the transcript event.
       */
      id: segment.id,

      sessionId: segment.sessionId,

      speaker: this.resolveSpeaker(segment),

      speakerId: segment.speakerId,

      text,

      startMs,

      endMs,

      isFinal: segment.isFinal,

      confidence: segment.confidence,

      createdAt: segment.endedAt,

      source: "audio",
    };
  }

  private resolveSpeaker(segment: AudioTranscriptSegment): SpeakerRole {
    if (!segment.speakerId) {
      return this.defaultSpeaker;
    }

    return this.speakerRolesById[segment.speakerId] ?? this.defaultSpeaker;
  }
}
