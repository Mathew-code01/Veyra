// ============================================================================
// FILE: core/cloud/providers/HuggingFace/HuggingFaceModels.ts
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

export const HUGGINGFACE_MODELS: readonly CloudModel[] = Object.freeze([
  {
    id: "hf-whisper-large-v3",
    providerId: "huggingface",
    modelId: "openai/whisper-large-v3",
    displayName: "Whisper Large V3",
    modalities: ["audio"],
    tasks: ["speech_to_text"],
    capabilities: createCloudCapabilities({
      speechToText: true,
    }),
    production: true,
  },

  {
    id: "hf-chat-default",
    providerId: "huggingface",
    modelId: "meta-llama/Llama-3.1-8B-Instruct",
    displayName: "Hugging Face Chat Model",
    modalities: ["text"],
    tasks: ["text_generation"],
    capabilities: createCloudCapabilities({
      textGeneration: true,
      streaming: true,
    }),
    production: true,
    metadata: {
      providerModel: "inference-provider-selected",
    },
  },
]);
