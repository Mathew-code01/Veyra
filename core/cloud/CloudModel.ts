// ============================================================================
// FILE: core/cloud/CloudModel.ts
// PURPOSE:
// Describes a remotely hosted model without containing credentials.
// ============================================================================

import type { CloudCapabilities } from "./CloudCapabilities";

export type CloudModelModality =
  | "text"
  | "vision"
  | "audio"
  | "speech"
  | "embedding"
  | "multimodal"
  | "document";

export type CloudModelTask =
  | "text_generation"
  | "vision"
  | "speech_to_text"
  | "text_to_speech"
  | "embedding"
  | "document_analysis";

export interface CloudModelPricing {
  /**
   * Price per one million input tokens, when known.
   */
  readonly inputPerMillionTokens?: number;

  /**
   * Price per one million output tokens, when known.
   */
  readonly outputPerMillionTokens?: number;

  /**
   * Price per minute of audio, when known.
   */
  readonly audioPerMinute?: number;

  /**
   * Price per image, when known.
   */
  readonly imagePerUnit?: number;

  /**
   * Currency, normally USD.
   */
  readonly currency?: string;
}

export interface CloudModel {
  /**
   * Internal stable identifier.
   */
  readonly id: string;

  /**
   * Provider owning the model.
   */
  readonly providerId: string;

  /**
   * Actual remote API model identifier.
   */
  readonly modelId: string;

  /**
   * Human-readable display name.
   */
  readonly displayName: string;

  /**
   * Supported modalities.
   */
  readonly modalities: readonly CloudModelModality[];

  /**
   * Supported tasks.
   */
  readonly tasks: readonly CloudModelTask[];

  /**
   * Capability matrix.
   */
  readonly capabilities: CloudCapabilities;

  /**
   * Context window, when known.
   */
  readonly contextWindow?: number;

  /**
   * Maximum output tokens, when known.
   */
  readonly maxOutputTokens?: number;

  /**
   * Pricing metadata.
   *
   * This is informational only and must never be used as
   * an authorization or billing source of truth.
   */
  readonly pricing?: CloudModelPricing;

  /**
   * Whether the model should be considered production-ready.
   */
  readonly production: boolean;

  /**
   * Optional provider/model metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
