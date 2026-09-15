// ============================================================================
// FILE: core/cloud/providers/Cerebras/CerebrasModels.ts
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

export const CEREBRAS_MODELS: readonly CloudModel[] = Object.freeze([
  {
    id: "cerebras-gpt-oss-120b",
    providerId: "cerebras",
    modelId: "gpt-oss-120b",
    displayName: "GPT OSS 120B",
    modalities: ["text"],
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
    id: "cerebras-llama-3.3-70b",
    providerId: "cerebras",
    modelId: "llama-3.3-70b",
    displayName: "Llama 3.3 70B",
    modalities: ["text"],
    tasks: ["text_generation"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
      structuredOutput: true,
      toolCalling: true,
    }),
    production: true,
  },
]);
