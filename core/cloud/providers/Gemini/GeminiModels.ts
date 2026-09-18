
// ============================================================================
// FILE: core/cloud/providers/Gemini/GeminiModels.ts
//
// PURPOSE:
// Canonical Gemini model catalog used by the Veyra Gemini provider.
//
// CURRENT MODELS:
// - gemini-2.5-flash
// - gemini-3.1-pro-preview
//
// IMPORTANT:
// - gemini-2.5-flash is the default general-purpose model.
// - gemini-3.1-pro-preview is the advanced reasoning/preview model.
// - gemini-2.5-pro has intentionally been removed from the catalog.
// - This file contains metadata only.
// - It does not perform API requests.
// - It does not contain credentials.
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

// ============================================================================
// GEMINI MODEL CATALOG
// ============================================================================

export const GEMINI_MODELS: readonly CloudModel[] = Object.freeze([
  // ==========================================================================
  // GEMINI 2.5 FLASH
  // ==========================================================================
  {
    id: "gemini-2.5-flash",

    providerId: "gemini",

    modelId: "gemini-2.5-flash",

    displayName: "Gemini 2.5 Flash",

    modalities: ["text", "vision", "multimodal", "document"],

    tasks: [
      "text_generation",
      "vision",
      "document_analysis",
    ],

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

  // ==========================================================================
  // GEMINI 3.1 PRO PREVIEW
  // ==========================================================================
  {
    id: "gemini-3.1-pro-preview",

    providerId: "gemini",

    modelId: "gemini-3.1-pro-preview",

    displayName: "Gemini 3.1 Pro Preview",

    modalities: ["text", "vision", "multimodal", "document"],

    tasks: [
      "text_generation",
      "vision",
      "document_analysis",
    ],

    capabilities: createCloudCapabilities({
      textGeneration: true,

      streaming: true,

      vision: true,

      documentAnalysis: true,

      structuredOutput: true,

      toolCalling: true,
    }),

    production: false,
  },
]);
