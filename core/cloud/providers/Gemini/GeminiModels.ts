// ============================================================================
// FILE: core/cloud/providers/Gemini/GeminiModels.ts
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

export const GEMINI_MODELS: readonly CloudModel[] = Object.freeze([
  {
    id: "gemini-2.5-flash",
    providerId: "gemini",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    modalities: ["text", "vision", "multimodal", "document"],
    tasks: ["text_generation", "vision", "document_analysis"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
      vision: true,
      documentAnalysis: true,
      structuredOutput: true,
      toolCalling: true,
    }),
    production: true,
  },

  {
    id: "gemini-2.5-pro",
    providerId: "gemini",
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    modalities: ["text", "vision", "multimodal", "document"],
    tasks: ["text_generation", "vision", "document_analysis"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
      vision: true,
      documentAnalysis: true,
      structuredOutput: true,
      toolCalling: true,
    }),
    production: true,
  },
]);
