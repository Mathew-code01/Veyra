// ============================================================================
// FILE: core/cloud/providers/OpenRouter/OpenRouterModels.ts
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

/**
 * OpenRouter intentionally does not hardcode the entire model catalogue.
 *
 * The provider exposes a dynamic model catalogue that can be retrieved
 * from the OpenRouter API.
 *
 * These entries represent stable Veyra defaults/fallbacks only.
 */
export const OPENROUTER_MODELS: readonly CloudModel[] = Object.freeze([
  {
    id: "openrouter-auto",
    providerId: "openrouter",
    modelId: "openrouter/auto",
    displayName: "OpenRouter Auto",
    modalities: ["text", "multimodal"],
    tasks: ["text_generation", "vision"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
      vision: true,
      structuredOutput: true,
      toolCalling: true,
    }),
    production: true,
    metadata: {
      dynamicCatalogue: true,
    },
  },
]);
