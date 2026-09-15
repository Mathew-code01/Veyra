// ============================================================================
// FILE: core/cloud/capabilities/TextGenerationCapability.ts
// ============================================================================

export interface TextGenerationCapability {
  readonly supported: boolean;

  readonly streaming: boolean;

  readonly structuredOutput: boolean;

  readonly toolCalling: boolean;

  readonly maxContextTokens?: number;

  readonly maxOutputTokens?: number;
}
