// ============================================================================
// FILE: core/audio/AudioContextPublisher.ts
//
// PURPOSE:
// Connect finalized audio transcript segments to the generic Veyra Context
// subsystem.
//
// ARCHITECTURE:
//
//     core/audio
//          │
//          ▼
//     shared/types/audio
//          │
//          ▼
//     AudioContextPublisher
//          │
//          ▼
//     ContextManager
//          │
//          ▼
//     Context ingestion
//          │
//          ▼
//     embeddings
//          │
//          ▼
//     vector store
//
// IMPORTANT:
//
// This adapter belongs to the AUDIO side of the boundary.
//
// It is therefore allowed to depend on ContextManager.
//
// ContextManager itself must NEVER import this class or import core/audio.
//
// The dependency direction remains:
//
//     audio → context
//
// and never:
//
//     context → audio
//
// ONLY FINALIZED TRANSCRIPTS ARE PUBLISHED.
//
// Partial transcription results must never be indexed into Context because
// they are unstable and may be replaced by subsequent provider output.
// ============================================================================

import type { UUID } from "../../shared/types/common";

import type { AudioTranscriptSegment } from "../../shared/types/audio";

import type {
  ContextIndexResult,
  ContextManager,
} from "../context/ContextManager";

import type {
  ContextMetadata,
  ContextScope,
} from "../context/contracts/ContextTypes";

// ============================================================================
// OPTIONS
// ============================================================================

export interface AudioContextPublisherOptions {
  /**
   * Generic Context orchestration service.
   *
   * The audio subsystem does not construct embeddings, chunks or vector
   * records itself. It delegates those responsibilities to ContextManager.
   */
  readonly contextManager: ContextManager;

  /**
   * Optional scope inherited from the active application/session context.
   *
   * Audio always adds sessionId automatically.
   *
   * Callers may additionally provide:
   *
   * - candidateId
   * - conversationId
   * - interviewId
   * - applicationId
   * - userId
   *
   * Context does not interpret these values.
   */
  readonly scope?: ContextScope;

  /**
   * Additional metadata attached to every indexed audio transcript.
   *
   * Audio-specific metadata remains metadata.
   * Context does not interpret it.
   */
  readonly metadata?: ContextMetadata;
}

// ============================================================================
// PUBLICATION RESULT
// ============================================================================

export interface PublishedAudioContext {
  /**
   * Original shared audio transcript segment.
   */
  readonly segment: AudioTranscriptSegment;

  /**
   * Context item created for this transcript segment.
   */
  readonly contextId: string;

  /**
   * Number of Context chunks generated for this segment.
   */
  readonly chunkCount: number;

  /**
   * Complete Context indexing result.
   */
  readonly indexed: ContextIndexResult;
}

// ============================================================================
// PUBLISH OPTIONS
// ============================================================================

export interface AudioContextPublishOptions {
  /**
   * Cancellation signal.
   */
  readonly signal?: AbortSignal;

  /**
   * Optional scope override for this publication.
   *
   * When supplied, this is merged over the publisher-level scope.
   */
  readonly scope?: ContextScope;

  /**
   * Optional metadata override for this publication.
   *
   * When supplied, this is merged over the publisher-level metadata.
   */
  readonly metadata?: ContextMetadata;
}

// ============================================================================
// PUBLISHER
// ============================================================================

export class AudioContextPublisher {
  private readonly contextManager: ContextManager;

  private readonly scope?: ContextScope;

  private readonly metadata?: ContextMetadata;

  public constructor(options: AudioContextPublisherOptions) {
    if (!options) {
      throw new Error("AudioContextPublisher options are required.");
    }

    if (!options.contextManager) {
      throw new Error("AudioContextPublisher requires a ContextManager.");
    }

    this.contextManager = options.contextManager;

    this.scope = options.scope;

    this.metadata = options.metadata;
  }

  // ==========================================================================
  // SINGLE PUBLICATION
  // ==========================================================================

  /**
   * Publish one finalized shared audio transcript segment into Context.
   *
   * The segment itself is already the canonical shared representation.
   *
   * This method deliberately does not:
   *
   * - transcribe audio
   * - normalize transcript text
   * - classify speakers
   * - generate embeddings
   * - write directly to vector storage
   *
   * Those responsibilities remain with their respective subsystems.
   */
  public async publish(
    segment: AudioTranscriptSegment,
    options: AudioContextPublishOptions = {},
  ): Promise<PublishedAudioContext> {
    this.validateSegment(segment);

    this.throwIfAborted(options.signal);

    const contextId = createAudioContextId(segment);

    const context = {
      id: contextId,

      name: createContextName(segment),

      contentType: "transcript" as const,

      source: {
        type: "audio" as const,

        id: segment.id,

        name: "Audio transcript",

        metadata: {
          sessionId: segment.sessionId,

          segmentId: segment.id,

          provider: segment.provider,

          model: segment.model,

          language: segment.language,
        },
      },

      scope: {
        ...(this.scope ?? {}),

        ...(options.scope ?? {}),

        /*
         * Session identity is authoritative from the shared audio
         * transcript and therefore cannot be accidentally omitted.
         */
        sessionId: segment.sessionId,
      },

      text: segment.text,

      metadata: {
        ...(this.metadata ?? {}),

        ...(options.metadata ?? {}),

        /*
         * Canonical audio provenance.
         */
        source: "audio",

        sourceType: "audio",

        sourceId: segment.id,

        sessionId: segment.sessionId,

        segmentId: segment.id,

        speakerId: segment.speakerId,

        confidence: segment.confidence,

        provider: segment.provider,

        model: segment.model,

        language: segment.language,

        startedAt: segment.startedAt,

        endedAt: segment.endedAt,

        isFinal: segment.isFinal,
      },

      /*
       * The audio transcript already has authoritative timestamps.
       *
       * Context treats these as provenance timestamps.
       */
      createdAt: segment.startedAt,

      updatedAt: segment.endedAt,
    };

    this.throwIfAborted(options.signal);

    const indexed = await this.contextManager.index(context, {
      signal: options.signal,
    });

    this.throwIfAborted(options.signal);

    return Object.freeze({
      segment,

      contextId,

      chunkCount: indexed.chunks.length,

      indexed,
    });
  }

  // ==========================================================================
  // MANY
  // ==========================================================================

  /**
   * Publish multiple finalized audio transcript segments.
   *
   * Publication is intentionally sequential.
   *
   * This prevents a large batch of transcript segments from simultaneously
   * competing for embedding/model resources.
   */
  public async publishMany(
    segments: readonly AudioTranscriptSegment[],
    options: AudioContextPublishOptions = {},
  ): Promise<readonly PublishedAudioContext[]> {
    if (!Array.isArray(segments)) {
      throw new Error("AudioContextPublisher.publishMany requires an array.");
    }

    this.throwIfAborted(options.signal);

    if (segments.length === 0) {
      return Object.freeze([]);
    }

    const published: PublishedAudioContext[] = [];

    for (const segment of segments) {
      this.throwIfAborted(options.signal);

      const result = await this.publish(segment, options);

      published.push(result);
    }

    return Object.freeze(published);
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  public getContextManager(): ContextManager {
    return this.contextManager;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  private validateSegment(segment: AudioTranscriptSegment): void {
    if (!segment) {
      throw new Error(
        "AudioContextPublisher requires an audio transcript segment.",
      );
    }

    if (!segment.id || !segment.id.trim()) {
      throw new Error("Audio transcript segment must have a non-empty ID.");
    }

    if (!segment.sessionId || !segment.sessionId.trim()) {
      throw new Error(
        "Audio transcript segment must have a non-empty sessionId.",
      );
    }

    if (typeof segment.text !== "string") {
      throw new Error("Audio transcript segment text must be a string.");
    }

    if (!segment.text.trim()) {
      throw new Error("Audio transcript segment contains no usable text.");
    }

    if (segment.source !== "audio") {
      throw new Error(
        `AudioContextPublisher received an invalid source "${segment.source}".`,
      );
    }

    if (!segment.isFinal) {
      throw new Error(
        "Only finalized audio transcript segments may enter Context.",
      );
    }

    if (!isValidDateString(segment.startedAt)) {
      throw new Error(
        "Audio transcript segment contains an invalid startedAt timestamp.",
      );
    }

    if (!isValidDateString(segment.endedAt)) {
      throw new Error(
        "Audio transcript segment contains an invalid endedAt timestamp.",
      );
    }
  }

  // ==========================================================================
  // CANCELLATION
  // ==========================================================================

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Audio context publication was cancelled.");
  }
}

// ============================================================================
// IDENTIFIERS
// ============================================================================

/**
 * Stable Context identity for an audio transcript segment.
 *
 * The shared audio segment ID is already stable, so re-indexing the same
 * segment replaces the previous searchable representation rather than
 * creating an unrelated Context item.
 */
function createAudioContextId(segment: AudioTranscriptSegment): string {
  return `audio:${segment.sessionId}:transcript:${segment.id}`;
}

// ============================================================================
// NAME
// ============================================================================

function createContextName(segment: AudioTranscriptSegment): string {
  const speaker = segment.speakerId?.trim() || "unknown-speaker";

  return `Audio transcript · ${speaker} · ${segment.id}`;
}

// ============================================================================
// DATE VALIDATION
// ============================================================================

function isValidDateString(value: string): boolean {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}
