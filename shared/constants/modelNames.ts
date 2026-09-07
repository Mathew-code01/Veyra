// shared/constants/modelNames.ts

// shared/constants/modelNames.ts

import type { AIProvider } from "../types/ai";

/**
 * Supported AI providers.
 *
 * This is intentionally derived from the canonical AIProvider type
 * instead of defining another AIProvider type in this file.
 */
export const AI_PROVIDERS = Object.freeze([
  "gemini",
  "ollama",
  "mock",
] as const);

export const MODEL_NAMES = Object.freeze({
  /**
   * Gemini models.
   */
  GEMINI_FLASH: "gemini-3.1-flash-lite",
  GEMINI_FLASH_PRIMARY: "gemini-3.7-flash",

  /**
   * Ollama models.
   */
  OLLAMA_DEFAULT: "llama3.2",
  OLLAMA_SMALL: "llama3.2:3b",

  /**
   * Test/development provider.
   */
  MOCK: "mock-model",
} as const);

export type ModelName =
  (typeof MODEL_NAMES)[keyof typeof MODEL_NAMES];

/**
 * Default model for each supported provider.
 */
export const DEFAULT_MODELS: Readonly<Record<AIProvider, ModelName>> =
  Object.freeze({
    gemini: MODEL_NAMES.GEMINI_FLASH,
    ollama: MODEL_NAMES.OLLAMA_DEFAULT,
    mock: MODEL_NAMES.MOCK,
  });

/**
 * Capabilities supported by AI models.
 */
export const MODEL_CAPABILITIES = Object.freeze({
  text: "text",
  streaming: "streaming",
  vision: "vision",
  embeddings: "embeddings",
} as const);

export type ModelCapability =
  (typeof MODEL_CAPABILITIES)[keyof typeof MODEL_CAPABILITIES];

/**
 * Provider-independent model metadata.
 *
 * This gives the rest of Veyra a stable way to determine
 * what a model can do without hard-coding provider checks
 * throughout the application.
 */
export interface ModelDefinition {
  readonly provider: AIProvider;
  readonly model: ModelName;
  readonly capabilities: readonly ModelCapability[];
  readonly isDefault: boolean;
}

export const MODEL_DEFINITIONS: readonly ModelDefinition[] =
  Object.freeze([
    {
      provider: "gemini",
      model: MODEL_NAMES.GEMINI_FLASH_PRIMARY,
      capabilities: ["text", "streaming"],
      isDefault: false,
    },
    {
      provider: "gemini",
      model: MODEL_NAMES.GEMINI_FLASH,
      capabilities: ["text", "streaming"],
      isDefault: true,
    },
    {
      provider: "ollama",
      model: MODEL_NAMES.OLLAMA_DEFAULT,
      capabilities: ["text", "streaming"],
      isDefault: true,
    },
    {
      provider: "ollama",
      model: MODEL_NAMES.OLLAMA_SMALL,
      capabilities: ["text", "streaming"],
      isDefault: false,
    },
    {
      provider: "mock",
      model: MODEL_NAMES.MOCK,
      capabilities: ["text", "streaming"],
      isDefault: true,
    },
  ] as const);

/**
 * Runtime helper for validating provider names.
 */
export function isAIProvider(
  value: string,
): value is AIProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resolve the default model for a provider.
 */
export function getDefaultModel(
  provider: AIProvider,
): ModelName {
  return DEFAULT_MODELS[provider];
}