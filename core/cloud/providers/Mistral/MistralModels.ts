// ============================================================================
// FILE: core/cloud/providers/Mistral/MistralModels.ts
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

export const MISTRAL_MODELS: readonly CloudModel[] = Object.freeze([
  {
    id: "mistral-large",
    providerId: "mistral",
    modelId: "mistral-large-latest",
    displayName: "Mistral Large",
    modalities: ["text", "multimodal"],
    tasks: ["text_generation"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
      structuredOutput: true,
      toolCalling: true,
    }),
    production: true,
  },

  {
    id: "mistral-small",
    providerId: "mistral",
    modelId: "mistral-small-latest",
    displayName: "Mistral Small",
    modalities: ["text", "multimodal"],
    tasks: ["text_generation"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
      structuredOutput: true,
      toolCalling: true,
    }),
    production: true,
  },

  {
    id: "mistral-embed",
    providerId: "mistral",
    modelId: "mistral-embed",
    displayName: "Mistral Embed",
    modalities: ["embedding"],
    tasks: ["embedding"],
    capabilities: createCloudCapabilities({
      embeddings: true,
    }),
    production: true,
  },
]);
