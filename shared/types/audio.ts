// shared/types/audio.ts

import type { ISODateString, UUID } from "./common";

/**
 * Audio device direction.
 */
export type AudioDeviceType = "input" | "output";

/**
 * Audio device information exposed across the application boundary.
 */
export interface AudioDevice {
  readonly id: string;

  readonly label: string;

  readonly type: AudioDeviceType;

  readonly isDefault: boolean;

  readonly enabled: boolean;
}

/**
 * Permission states shared by OS/device integrations.
 */
export type PermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * Current microphone permission.
 */
export interface AudioPermissionState {
  readonly microphone: PermissionState;
}

/**
 * Audio session lifecycle state.
 */
export interface AudioSessionState {
  readonly sessionId?: UUID;

  readonly active: boolean;

  readonly deviceId: string | null;

  readonly startedAt: ISODateString | null;

  readonly stoppedAt?: ISODateString | null;

  readonly sampleRate: number;

  readonly channels: number;

  readonly bytesCaptured: number;

  readonly durationMs: number;
}

/**
 * Speaker identity associated with an audio transcript.
 */
export type TranscriptSpeaker = "interviewer" | "candidate" | "unknown";

/**
 * Audio-pipeline-specific transcript segment.
 *
 * NOTE:
 * This is intentionally NOT named TranscriptSegment.
 * The canonical conversational TranscriptSegment lives in
 * shared/types/conversation.ts.
 */
export interface AudioTranscriptSegment {
  readonly id: UUID;

  readonly text: string;

  readonly speaker: TranscriptSpeaker;

  readonly startedAt: ISODateString;

  readonly endedAt: ISODateString;

  readonly confidence: number;

  readonly isFinal: boolean;
}

/**
 * Current transcript state produced by the audio subsystem.
 */
export interface TranscriptState {
  readonly active: boolean;

  readonly segments: readonly AudioTranscriptSegment[];

  readonly partialText: string;
}

/**
 * Audio processing metrics.
 */
export interface AudioMetrics {
  readonly sessionId?: UUID;

  readonly sampleRate: number;

  readonly channels: number;

  readonly bytesCaptured: number;

  readonly durationMs: number;

  readonly droppedFrames: number;

  readonly speechDurationMs: number;

  readonly silenceDurationMs: number;
}
