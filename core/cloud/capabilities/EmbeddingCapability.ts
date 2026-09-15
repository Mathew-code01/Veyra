// ============================================================================
// FILE: core/cloud/capabilities/EmbeddingCapability.ts
// ============================================================================

export interface EmbeddingCapability {
  readonly supported: boolean;

  readonly dimensions?: number;

  readonly maxInputTokens?: number;

  readonly supportsBatching: boolean;
}
