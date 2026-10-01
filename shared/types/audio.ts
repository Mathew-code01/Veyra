// ============================================================================
// FILE: shared/types/audio.ts
// PURPOSE:
// Stable audio-domain types shared across core, desktop, client and server.
//
// ARCHITECTURAL RULE:
// This file describes application-boundary data.
// It does NOT import from core/audio.
//
// core/audio owns implementation types such as:
// - AudioChunk
// - AudioBuffer
// - TranscriptionEngine
// - TranscriptAssembler
//
// This file owns the stable representation that other layers may consume.
// ============================================================================

import type { ISODateString, UUID } from "./common";

// ============================================================================
// DEVICE
// ============================================================================

/**
 * Audio device direction.
 */
export type AudioDeviceType = "input" | "output";

/**
 * Audio device exposed across an application boundary.
 */
export interface AudioDevice {
  readonly id: string;

  readonly label: string;

  readonly type: AudioDeviceType;

  readonly isDefault: boolean;

  readonly enabled: boolean;
}

// ============================================================================
// PERMISSIONS
// ============================================================================

export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

export interface AudioPermissionState {
  readonly microphone: PermissionState;
}

// ============================================================================
// AUDIO FORMAT
// ============================================================================

/**
 * Stable shared representation of an audio format.
 *
 * This mirrors the conceptual format used by core/audio without
 * importing the core implementation.
 */
export type AudioSampleFormat =
  "pcm_s16le" | "pcm_f32le" | "wav" | "opus" | "webm";

export interface AudioFormat {
  readonly sampleRate: number;

  readonly channels: number;

  readonly sampleFormat: AudioSampleFormat;

  readonly bitDepth?: 16 | 24 | 32;
}

// ============================================================================
// AUDIO SESSION
// ============================================================================

/**
 * Application-level audio session state.
 *
 * A session represents a capture lifecycle, not a conversation itself.
 */
export interface AudioSessionState {
  readonly sessionId: UUID;

  readonly active: boolean;

  readonly deviceId: string | null;

  readonly startedAt: ISODateString | null;

  readonly stoppedAt: ISODateString | null;

  readonly format: AudioFormat;

  readonly bytesCaptured: number;

  readonly durationMs: number;
}

// ============================================================================
// AUDIO TRANSCRIPT
// ============================================================================

/**
 * Optional speaker identifier.
 *
 * Audio deliberately does NOT define semantic identities such as
 * interviewer/candidate.
 *
 * Higher-level conversation/interview logic may interpret this identifier.
 */
export type AudioSpeakerId = string;

/**
 * Transcript segment produced by the audio subsystem.
 *
 * This is intentionally distinct from the canonical conversation
 * TranscriptSegment.
 *
 * Stage B will define the mapping:
 *
 * core/audio
 *     ↓
 * shared audio transcript
 *     ↓
 * core/conversation
 */
export interface AudioTranscriptSegment {
  readonly id: UUID;

  readonly sessionId: UUID;

  readonly text: string;

  readonly speakerId?: AudioSpeakerId;

  readonly startedAt: ISODateString;

  readonly endedAt: ISODateString;

  readonly confidence?: number;

  readonly isFinal: boolean;

  /**
   * Identifies the subsystem that produced the transcript.
   */
  readonly source: "audio";

  /**
   * Optional transcription provider information.
   */
  readonly provider?: string;

  /**
   * Optional model identifier.
   */
  readonly model?: string;

  /**
   * Optional detected language.
   */
  readonly language?: string;
}

// ============================================================================
// TRANSCRIPT STATE
// ============================================================================

/**
 * Current audio transcript state.
 *
 * This remains an audio-domain state object.
 * It is not the canonical conversation state.
 */
export interface TranscriptState {
  readonly sessionId: UUID;

  readonly active: boolean;

  readonly segments: readonly AudioTranscriptSegment[];

  /**
   * Current non-final transcript text.
   */
  readonly partialText: string;
}

// ============================================================================
// AUDIO METRICS
// ============================================================================

export interface AudioMetrics {
  readonly sessionId: UUID;

  readonly sampleRate: number;

  readonly channels: number;

  readonly bytesCaptured: number;

  readonly durationMs: number;

  readonly droppedFrames: number;

  readonly speechDurationMs: number;

  readonly silenceDurationMs: number;
}
