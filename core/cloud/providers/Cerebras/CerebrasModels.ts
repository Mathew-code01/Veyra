// ============================================================================
// FILE: core/cloud/providers/Cerebras/CerebrasModels.ts
// PURPOSE:
// Veyra's Cerebras model catalog.
//
// CURRENT CATALOG:
// - GPT OSS 120B
// - Llama 3.1 8B
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

// ============================================================================
// MODELS
// ============================================================================

export const CEREBRAS_MODELS: readonly CloudModel[] = Object.freeze([
  // ========================================================================
  // GPT OSS 120B
  // ========================================================================

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

  // ========================================================================
  // LLAMA 3.1 8B
  // ========================================================================

  {
    id: "cerebras-llama3.1-8b",

    providerId: "cerebras",

    modelId: "llama3.1-8b",

    displayName: "Llama 3.1 8B",

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
