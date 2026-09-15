// ============================================================================
// FILE: core/cloud/CloudCapabilities.ts
// PURPOSE:
// Canonical capability contract for remote/cloud providers.
//
// IMPORTANT:
// This file contains capability metadata only.
// It must not contain API keys, provider-specific business logic,
// interview logic, routing policy, or application state.
// ============================================================================

import type { CloudCapability } from "./capabilities/CloudCapability";

export interface CloudCapabilities {
  /**
   * Provider supports normal text generation.
   */
  readonly textGeneration: boolean;

  /**
   * Provider supports token/event streaming.
   */
  readonly streaming: boolean;

  /**
   * Provider can understand images.
   */
  readonly vision: boolean;

  /**
   * Provider can transcribe speech/audio.
   */
  readonly speechToText: boolean;

  /**
   * Provider can synthesize speech.
   */
  readonly textToSpeech: boolean;

  /**
   * Provider can generate embeddings.
   */
  readonly embeddings: boolean;

  /**
   * Provider can perform document understanding.
   */
  readonly documentAnalysis: boolean;

  /**
   * Provider supports structured output.
   */
  readonly structuredOutput: boolean;

  /**
   * Provider supports tool/function calling.
   */
  readonly toolCalling: boolean;
}

/**
 * Creates an immutable capability object.
 */
export function createCloudCapabilities(
  overrides: Partial<CloudCapabilities> = {},
): CloudCapabilities {
  return Object.freeze({
    textGeneration: false,
    streaming: false,
    vision: false,
    speechToText: false,
    textToSpeech: false,
    embeddings: false,
    documentAnalysis: false,
    structuredOutput: false,
    toolCalling: false,
    ...overrides,
  });
}

/**
 * Converts the canonical capability object into the individual
 * CloudCapability enum/string values.
 */
export function getSupportedCloudCapabilities(
  capabilities: CloudCapabilities,
): readonly CloudCapability[] {
  const supported: CloudCapability[] = [];

  if (capabilities.textGeneration) {
    supported.push("text_generation");
  }

  if (capabilities.streaming) {
    supported.push("streaming");
  }

  if (capabilities.vision) {
    supported.push("vision");
  }

  if (capabilities.speechToText) {
    supported.push("speech_to_text");
  }

  if (capabilities.textToSpeech) {
    supported.push("text_to_speech");
  }

  if (capabilities.embeddings) {
    supported.push("embedding");
  }

  if (capabilities.documentAnalysis) {
    supported.push("document_analysis");
  }

  if (capabilities.structuredOutput) {
    supported.push("structured_output");
  }

  if (capabilities.toolCalling) {
    supported.push("tool_calling");
  }

  return Object.freeze(supported);
}
