// ============================================================================
// FILE: core/cloud/providers/Groq/GroqModels.ts
// ============================================================================

import type { CloudModel } from "../../CloudModel";

import { createCloudCapabilities } from "../../CloudCapabilities";

export const GROQ_MODELS: readonly CloudModel[] = Object.freeze([
  {
    id: "groq-gpt-oss-120b",
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
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
    id: "groq-gpt-oss-20b",
    providerId: "groq",
    modelId: "openai/gpt-oss-20b",
    displayName: "GPT OSS 20B",
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
    id: "groq-whisper-large-v3",
    providerId: "groq",
    modelId: "whisper-large-v3",
    displayName: "Whisper Large V3",
    modalities: ["audio"],
    tasks: ["speech_to_text"],
    capabilities: createCloudCapabilities({
      speechToText: true,
    }),
    production: true,
  },

  {
    id: "groq-whisper-large-v3-turbo",
    providerId: "groq",
    modelId: "whisper-large-v3-turbo",
    displayName: "Whisper Large V3 Turbo",
    modalities: ["audio"],
    tasks: ["speech_to_text"],
    capabilities: createCloudCapabilities({
      speechToText: true,
    }),
    production: true,
  },

  {
    id: "groq-orpheus-english",
    providerId: "groq",
    modelId: "canopylabs/orpheus-v1-english",
    displayName: "Orpheus English",
    modalities: ["speech"],
    tasks: ["text_to_speech"],
    capabilities: createCloudCapabilities({
      textToSpeech: true,
    }),
    production: true,
  },

  {
    id: "groq-orpheus-arabic",
    providerId: "groq",
    modelId: "canopylabs/orpheus-arabic-saudi",
    displayName: "Orpheus Arabic Saudi",
    modalities: ["speech"],
    tasks: ["text_to_speech"],
    capabilities: createCloudCapabilities({
      textToSpeech: true,
    }),
    production: true,
  },
]);
