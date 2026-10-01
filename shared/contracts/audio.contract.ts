// ============================================================================
// FILE: shared/contracts/audio.contract.ts
// PURPOSE:
// Shared API/IPC boundary contracts for the audio subsystem.
//
// IMPORTANT:
// This file must contain AUDIO contracts only.
//
// It must not contain:
// - AI requests
// - AI responses
// - conversation implementation
// - ModelManager types
// - TranscriptionEngine implementation
//
// The contracts describe what other layers may ask the audio subsystem
// to do and what the audio subsystem may return.
// ============================================================================

import type {
  AudioDevice,
  AudioFormat,
  AudioMetrics,
  AudioPermissionState,
  AudioSessionState,
  AudioTranscriptSegment,
  TranscriptState,
} from "../types/audio";

import type { Result, UUID } from "../types/common";

// ============================================================================
// DEVICE
// ============================================================================

/**
 * Request the currently available audio devices.
 */
export interface AudioListDevicesRequest {
  readonly includeDisabled?: boolean;
}

/**
 * Audio devices returned by the audio subsystem.
 */
export interface AudioListDevicesResponse {
  readonly devices: readonly AudioDevice[];
}

export type AudioListDevicesResult = Result<AudioListDevicesResponse>;

// ============================================================================
// PERMISSIONS
// ============================================================================

/**
 * Request current audio permission state.
 */
export interface AudioPermissionRequest {}

export interface AudioPermissionResponse {
  readonly permission: AudioPermissionState;
}

export type AudioPermissionResult = Result<AudioPermissionResponse>;

// ============================================================================
// SESSION START
// ============================================================================

/**
 * Request creation of an audio capture session.
 *
 * This contract describes the boundary only.
 * The actual capture implementation belongs to core/audio
 * and desktop adapters.
 */
export interface AudioSessionStartRequest {
  readonly deviceId?: string;

  readonly format?: AudioFormat;
}

/**
 * Response returned after the audio session has been started.
 */
export interface AudioSessionStartResponse {
  readonly session: AudioSessionState;
}

export type AudioSessionStartResult = Result<AudioSessionStartResponse>;

// ============================================================================
// SESSION STOP
// ============================================================================

export interface AudioSessionStopRequest {
  readonly sessionId: UUID;
}

export interface AudioSessionStopResponse {
  readonly session: AudioSessionState;
}

export type AudioSessionStopResult = Result<AudioSessionStopResponse>;

// ============================================================================
// SESSION STATE
// ============================================================================

export interface AudioSessionStateRequest {
  readonly sessionId: UUID;
}

export interface AudioSessionStateResponse {
  readonly session: AudioSessionState;
}

export type AudioSessionStateResult = Result<AudioSessionStateResponse>;

// ============================================================================
// TRANSCRIPT STATE
// ============================================================================

export interface AudioTranscriptStateRequest {
  readonly sessionId: UUID;
}

export interface AudioTranscriptStateResponse {
  readonly transcript: TranscriptState;
}

export type AudioTranscriptStateResult = Result<AudioTranscriptStateResponse>;

// ============================================================================
// TRANSCRIPT EVENT
// ============================================================================

/**
 * Event emitted when the audio subsystem produces a transcript segment.
 *
 * This is deliberately an audio contract.
 *
 * Stage B will determine how this event is translated into the
 * canonical conversation transcript.
 */
export interface AudioTranscriptEvent {
  readonly sessionId: UUID;

  readonly segment: AudioTranscriptSegment;
}

/**
 * Event emitted when an audio transcript segment is finalized.
 */
export interface AudioTranscriptFinalizedEvent extends AudioTranscriptEvent {
  readonly segment: AudioTranscriptSegment & {
    readonly isFinal: true;
  };
}

// ============================================================================
// AUDIO METRICS
// ============================================================================

export interface AudioMetricsRequest {
  readonly sessionId: UUID;
}

export interface AudioMetricsResponse {
  readonly metrics: AudioMetrics;
}

export type AudioMetricsResult = Result<AudioMetricsResponse>;

// ============================================================================
// AUDIO TRANSCRIPT SEGMENT RESULT
// ============================================================================

/**
 * Convenience result for APIs that return a single transcript segment.
 */
export interface AudioTranscriptSegmentResponse {
  readonly segment: AudioTranscriptSegment;
}

export type AudioTranscriptSegmentResult =
  Result<AudioTranscriptSegmentResponse>;
