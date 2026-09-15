// ============================================================================
// FILE: core/cloud/capabilities/SpeechToTextCapability.ts
// ============================================================================

export interface SpeechToTextCapability {
  readonly supported: boolean;

  readonly multilingual: boolean;

  readonly streaming: boolean;

  readonly timestamped: boolean;

  readonly diarization: boolean;

  readonly supportedAudioFormats: readonly string[];

  readonly maxAudioBytes?: number;
}
