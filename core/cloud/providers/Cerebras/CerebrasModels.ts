
// ============================================================================
// FILE: core/cloud/providers/Cerebras/CerebrasModels.ts
// PURPOSE:
// Veyra's Cerebras model catalog.
//
// CURRENT CATALOG:
// - OpenAI GPT OSS 120B
//
// IMPORTANT:
// - `llama3.1-8b` was deprecated by Cerebras on May 27, 2026.
// - GPT OSS 120B is the current production model used by Veyra here.
// - Free-tier availability depends on the Cerebras account's current
//   free-trial/free-tier entitlement and rate limits.
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

// ============================================================================
// MODELS
// ============================================================================

export const CEREBRAS_MODELS: readonly CloudModel[] = Object.freeze([
  // ========================================================================
  // OPENAI GPT OSS 120B
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
]);
