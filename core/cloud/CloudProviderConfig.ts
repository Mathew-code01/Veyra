// ============================================================================
// FILE: core/cloud/CloudProviderConfig.ts
// PURPOSE:
// Runtime configuration for a cloud provider.
// ============================================================================

import type { CloudCredential } from "./CloudCredential";

export interface CloudProviderConfig {
  /**
   * Stable provider identifier.
   *
   * Examples:
   * gemini
   * groq
   * cerebras
   */
  readonly id: string;

  /**
   * Human-readable name.
   */
  readonly name: string;

  /**
   * Provider API base URL.
   */
  readonly baseUrl: string;

  /**
   * Whether this provider is enabled.
   */
  readonly enabled: boolean;

  /**
   * Request timeout.
   */
  readonly timeoutMs: number;

  /**
   * Maximum number of retries.
   *
   * Actual retry policy should ultimately be delegated to
   * core/reliability.
   */
  readonly maxRetries: number;

  /**
   * Credential reference.
   */
  readonly credential?: CloudCredential;

  /**
   * Default model for each task.
   */
  readonly defaultModels?: Readonly<
    Partial<
      Record<
        | "text_generation"
        | "vision"
        | "speech_to_text"
        | "text_to_speech"
        | "embedding"
        | "document_analysis",
        string
      >
    >
  >;

  /**
   * Optional provider-specific headers.
   *
   * Never put secrets directly here.
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Optional provider metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
