
// ============================================================================
// FILE: core/cloud/registry/defaultCloudModels.ts
//
// PURPOSE:
// Canonical model catalog used by Veyra's built-in cloud providers.
//
// IMPORTANT:
// - This file contains model metadata only.
// - It does NOT contain API keys.
// - It does NOT perform requests.
// - It does NOT choose which provider should win.
// - Routing decisions belong above the cloud layer.
// ============================================================================

export type DefaultCloudModelCapability =
  | "text_generation"
  | "streaming"
  | "vision"
  | "speech_to_text"
  | "text_to_speech"
  | "embedding"
  | "document_analysis"
  | "structured_output"
  | "tool_calling";

export interface DefaultCloudModel {
  readonly id: string;

  readonly providerId:
    | "gemini"
    | "groq"
    | "cerebras"
    | "mistral"
    | "openrouter"
    | "huggingface";

  readonly name: string;

  readonly capabilities: readonly DefaultCloudModelCapability[];

  /**
   * Whether this is the default model used when a request does not
   * explicitly specify a model.
   */
  readonly default?: boolean;

  /**
   * Whether the model is intended for general production use.
   *
   * Preview models should normally be marked false.
   */
  readonly production?: boolean;

  /**
   * Optional descriptive metadata.
   */
  readonly contextWindow?: number;

  readonly notes?: string;
}

// ============================================================================
// DEFAULT CLOUD MODELS
// ============================================================================

export const DEFAULT_CLOUD_MODELS: readonly DefaultCloudModel[] =
  Object.freeze([
    // ========================================================================
    // GEMINI
    // ========================================================================

    {
      id: "gemini-2.5-flash",

      providerId: "gemini",

      name: "Gemini 2.5 Flash",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
        "document_analysis",
        "structured_output",
        "tool_calling",
      ],

      default: true,

      production: true,

      notes:
        "Stable general-purpose Gemini model used as Veyra's default Gemini model.",
    },

    {
      id: "gemini-3.1-pro-preview",

      providerId: "gemini",

      name: "Gemini 3.1 Pro Preview",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
        "document_analysis",
        "structured_output",
        "tool_calling",
      ],

      production: false,

      notes:
        "Advanced Gemini 3.1 Pro preview model for complex reasoning, coding, and multimodal workloads.",
    },

    // ========================================================================
    // GROQ
    // ========================================================================

    {
      id: "llama-3.3-70b-versatile",

      providerId: "groq",

      name: "Llama 3.3 70B Versatile",

      capabilities: [
        "text_generation",
        "streaming",
        "structured_output",
        "tool_calling",
      ],

      default: true,

      production: true,

      notes:
        "General-purpose Llama model exposed through Groq's inference API.",
    },

    {
      id: "llama-3.1-8b-instant",

      providerId: "groq",

      name: "Llama 3.1 8B Instant",

      capabilities: [
        "text_generation",
        "streaming",
        "structured_output",
      ],

      production: true,

      notes:
        "Small, low-latency model suitable for lightweight requests.",
    },

    {
      id: "whisper-large-v3",

      providerId: "groq",

      name: "Whisper Large V3",

      capabilities: ["speech_to_text"],

      production: true,

      notes: "Speech-to-text model exposed by Groq.",
    },

    {
      id: "whisper-large-v3-turbo",

      providerId: "groq",

      name: "Whisper Large V3 Turbo",

      capabilities: ["speech_to_text"],

      production: true,

      notes: "Lower-latency Groq speech-to-text model.",
    },

    // ========================================================================
    // CEREBRAS
    // ========================================================================
    //
    // CURRENT:
    //   gpt-oss-120b
    //
    // IMPORTANT:
    //   Cerebras currently provides a Free Trial with account credit.
    //   Free-tier availability/rate limits are account-dependent.
    //
    // DEPRECATED:
    //   llama3.1-8b
    //
    // ========================================================================

    {
      id: "gpt-oss-120b",

      providerId: "cerebras",

      name: "GPT OSS 120B",

      capabilities: [
        "text_generation",
        "streaming",
        "structured_output",
        "tool_calling",
      ],

      default: true,

      production: true,

      notes:
        "Current Cerebras production model. Free access is provided through Cerebras' account-level free-trial/free-tier entitlement and is subject to current rate limits; it is not a permanently unlimited free API model.",
    },

    // ========================================================================
    // MISTRAL
    // ========================================================================

    {
      id: "mistral-large-latest",

      providerId: "mistral",

      name: "Mistral Large",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
        "structured_output",
        "tool_calling",
      ],

      default: true,

      production: true,

      notes: "General-purpose Mistral model.",
    },

    {
      id: "mistral-small-latest",

      providerId: "mistral",

      name: "Mistral Small",

      capabilities: [
        "text_generation",
        "streaming",
        "structured_output",
      ],

      production: true,

      notes: "Smaller Mistral model for lighter workloads.",
    },

    {
      id: "mistral-embed",

      providerId: "mistral",

      name: "Mistral Embed",

      capabilities: ["embedding"],

      production: true,

      notes: "Mistral embedding model.",
    },

    // ========================================================================
    // OPENROUTER
    // ========================================================================

    {
      id: "openai/gpt-4o-mini",

      providerId: "openrouter",

      name: "GPT-4o Mini",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
        "structured_output",
        "tool_calling",
      ],

      default: true,

      production: true,

      notes:
        "OpenRouter model identifier. Actual upstream execution is controlled by OpenRouter.",
    },

    {
      id: "google/gemini-2.5-flash",

      providerId: "openrouter",

      name: "Gemini 2.5 Flash",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
        "structured_output",
        "tool_calling",
      ],

      production: true,

      notes: "Gemini 2.5 Flash accessed through OpenRouter.",
    },

    {
      id: "google/gemini-3.1-pro-preview",

      providerId: "openrouter",

      name: "Gemini 3.1 Pro Preview",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
        "structured_output",
        "tool_calling",
      ],

      production: false,

      notes: "Gemini 3.1 Pro Preview accessed through OpenRouter.",
    },

    {
      id: "meta-llama/llama-3.3-70b-instruct",

      providerId: "openrouter",

      name: "Llama 3.3 70B Instruct",

      capabilities: [
        "text_generation",
        "streaming",
        "structured_output",
        "tool_calling",
      ],

      production: true,

      notes: "Llama model accessed through OpenRouter.",
    },

    // ========================================================================
    // HUGGING FACE
    // ========================================================================

    {
      id: "meta-llama/Llama-3.1-8B-Instruct",

      providerId: "huggingface",

      name: "Llama 3.1 8B Instruct",

      capabilities: [
        "text_generation",
        "streaming",
        "structured_output",
      ],

      default: true,

      production: true,

      notes:
        "Hugging Face Inference Providers model identifier.",
    },

    {
      id: "Qwen/Qwen2.5-VL-7B-Instruct",

      providerId: "huggingface",

      name: "Qwen 2.5 VL 7B Instruct",

      capabilities: [
        "text_generation",
        "streaming",
        "vision",
      ],

      production: true,

      notes:
        "Vision-language model exposed through Hugging Face Inference Providers.",
    },
  ]);

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

export function getDefaultCloudModels(): readonly DefaultCloudModel[] {
  return DEFAULT_CLOUD_MODELS;
}

export function getCloudModelsForProvider(
  providerId: DefaultCloudModel["providerId"],
): readonly DefaultCloudModel[] {
  return Object.freeze(
    DEFAULT_CLOUD_MODELS.filter(
      (model) => model.providerId === providerId,
    ),
  );
}

export function getDefaultCloudModel(
  providerId: DefaultCloudModel["providerId"],
): DefaultCloudModel | undefined {
  return DEFAULT_CLOUD_MODELS.find(
    (model) =>
      model.providerId === providerId &&
      model.default === true,
  );
}

export function findDefaultCloudModel(
  providerId: DefaultCloudModel["providerId"],
  modelId: string,
): DefaultCloudModel | undefined {
  return DEFAULT_CLOUD_MODELS.find(
    (model) =>
      model.providerId === providerId &&
      model.id === modelId,
  );
}
