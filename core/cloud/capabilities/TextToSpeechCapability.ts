// ============================================================================
// FILE: core/cloud/capabilities/TextToSpeechCapability.ts
// ============================================================================

export interface TextToSpeechCapability {
  readonly supported: boolean;

  readonly streaming: boolean;

  readonly voices: readonly string[];

  readonly formats: readonly string[];

  readonly languages: readonly string[];

  readonly maxInputCharacters?: number;
}
