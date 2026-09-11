// Relative path: core/models/ModelRegistry.ts

import type { HardwareTier } from "../hardware/HardwareProfile";

export type ModelModality = "llm" | "stt" | "vision" | "tts" | "embedding";

export type ModelRuntime =
  "ollama" | "llama_cpp" | "whisper_cpp" | "onnx" | "native" | "cloud";

export type ModelAvailability =
  "available" | "planned" | "experimental" | "deprecated";

export type ModelQuantization =
  "none" | "fp32" | "fp16" | "bf16" | "q2" | "q3" | "q4" | "q5" | "q6" | "q8";

export interface ModelResourceRequirements {
  readonly minimumRamBytes: number;
  readonly recommendedRamBytes: number;
  readonly minimumVramBytes: number;
  readonly recommendedVramBytes: number;
  readonly minimumCpuCores: number;
  readonly recommendedCpuCores: number;
  readonly estimatedDiskBytes: number;
}

export interface ModelPerformanceHints {
  readonly latencyClass: "ultra_low" | "low" | "balanced" | "high";
  readonly qualityClass: "basic" | "good" | "high" | "excellent";
  readonly streaming: boolean;
  readonly batchProcessing: boolean;
  readonly gpuPreferred: boolean;
}

export interface ModelCapabilities {
  readonly textGeneration?: boolean;
  readonly reasoning?: boolean;
  readonly toolCalling?: boolean;
  readonly structuredOutput?: boolean;
  readonly multilingual?: boolean;
  readonly speechRecognition?: boolean;
  readonly visionUnderstanding?: boolean;
  readonly textToSpeech?: boolean;
  readonly embeddings?: boolean;
}

export interface ModelLicense {
  readonly name: string;
  readonly url?: string;
  readonly commercialUse: boolean;
  readonly redistributionAllowed: boolean;
  readonly attributionRequired: boolean;
  readonly notes?: string;
}

export interface ModelArtifact {
  /**
   * Stable artifact identifier inside the model package.
   *
   * Examples:
   *
   * model
   * mmproj
   * tokenizer
   * voices
   */
  readonly id: string;

  /**
   * Download location.
   */
  readonly url: string;

  /**
   * Exact filename on disk.
   */
  readonly filename: string;

  /**
   * Exact expected byte size.
   */
  readonly sizeBytes: number;

  /**
   * Required SHA-256.
   */
  readonly sha256: string;

  /**
   * Indicates the artifact containing the primary model.
   */
  readonly role:
    | "model"
    | "projector"
    | "tokenizer"
    | "config"
    | "voice"
    | "runtime"
    | "asset";

  /**
   * Optional runtime-specific metadata.
   */
  readonly tags?: readonly string[];
}

export interface ModelPackage {
  readonly artifacts: readonly ModelArtifact[];

  /**
   * Minimum number of files required before the package
   * can be considered completely installed.
   */
  readonly requiredArtifactIds: readonly string[];
}

export interface ModelDefinition {
  readonly id: string;

  readonly displayName: string;

  readonly family: string;

  readonly version?: string;

  readonly modality: ModelModality;

  readonly runtime: ModelRuntime;

  readonly availability: ModelAvailability;

  readonly quantization: ModelQuantization;

  readonly requirements: ModelResourceRequirements;

  readonly performance: ModelPerformanceHints;

  readonly capabilities: ModelCapabilities;

  readonly license: ModelLicense;

  readonly package?: ModelPackage;

  /**
   * @deprecated
   * Use package.artifacts and getPrimaryModelArtifact().
   *
   * This field exists only as a migration bridge
   * for legacy installation/recovery components.
   */
  readonly artifact?: ModelArtifact;

  readonly supportedHardwareTiers: readonly HardwareTier[];

  readonly tags: readonly string[];

  readonly priority: number;

  readonly enabledByDefault: boolean;
}



const GB = 1024 ** 3;

const MODEL_DEFINITIONS: readonly ModelDefinition[] = [
  /*
   * --------------------------------------------------------------------------
   * LLM
   * --------------------------------------------------------------------------
   */

  {
    id: "qwen3-0.6b",
    displayName: "Qwen3 0.6B",
    family: "Qwen3",
    version: "0.6B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 4 * GB,
      recommendedRamBytes: 6 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 0,
      minimumCpuCores: 2,
      recommendedCpuCores: 4,
      estimatedDiskBytes: 700 * 1024 ** 2,
    },
    performance: {
      latencyClass: "ultra_low",
      qualityClass: "basic",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: false,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      structuredOutput: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["ultra_low", "low", "standard"],
    tags: ["fallback", "low-memory", "fast", "offline"],
    priority: 10,
    enabledByDefault: false,
  },

  {
    id: "qwen3-1.7b",
    displayName: "Qwen3 1.7B",
    family: "Qwen3",
    version: "1.7B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 4 * GB,
      recommendedRamBytes: 8 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 0,
      minimumCpuCores: 2,
      recommendedCpuCores: 4,
      estimatedDiskBytes: 2 * GB,
    },
    performance: {
      latencyClass: "low",
      qualityClass: "good",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: false,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      structuredOutput: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["ultra_low", "low", "standard"],
    tags: ["fallback", "fast", "offline"],
    priority: 20,
    enabledByDefault: false,
  },

  {
    id: "qwen3-4b",
    displayName: "Qwen3 4B",
    family: "Qwen3",
    version: "4B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 6 * GB,
      recommendedRamBytes: 10 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 4 * GB,
      minimumCpuCores: 4,
      recommendedCpuCores: 6,
      estimatedDiskBytes: 3 * GB,
    },
    performance: {
      latencyClass: "low",
      qualityClass: "good",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["low", "standard", "high"],
    tags: ["default-low-end", "fast", "offline"],
    priority: 30,
    enabledByDefault: false,
  },

  {
    id: "qwen3-8b",
    displayName: "Qwen3 8B",
    family: "Qwen3",
    version: "8B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 10 * GB,
      recommendedRamBytes: 16 * GB,
      minimumVramBytes: 4 * GB,
      recommendedVramBytes: 8 * GB,
      minimumCpuCores: 6,
      recommendedCpuCores: 8,
      estimatedDiskBytes: 6 * GB,
    },
    performance: {
      latencyClass: "balanced",
      qualityClass: "high",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["standard", "high", "very_high"],
    tags: ["recommended", "interview", "offline"],
    priority: 40,
    enabledByDefault: true,
  },

  {
    id: "qwen3-14b",
    displayName: "Qwen3 14B",
    family: "Qwen3",
    version: "14B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 18 * GB,
      recommendedRamBytes: 32 * GB,
      minimumVramBytes: 8 * GB,
      recommendedVramBytes: 12 * GB,
      minimumCpuCores: 8,
      recommendedCpuCores: 12,
      estimatedDiskBytes: 10 * GB,
    },
    performance: {
      latencyClass: "balanced",
      qualityClass: "high",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["high", "very_high", "workstation"],
    tags: ["quality", "reasoning", "offline"],
    priority: 50,
    enabledByDefault: false,
  },

  {
    id: "mistral-small-3.2-24b",
    displayName: "Mistral Small 3.2 24B",
    family: "Mistral Small",
    version: "3.2 24B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 28 * GB,
      recommendedRamBytes: 48 * GB,
      minimumVramBytes: 12 * GB,
      recommendedVramBytes: 16 * GB,
      minimumCpuCores: 8,
      recommendedCpuCores: 12,
      estimatedDiskBytes: 18 * GB,
    },
    performance: {
      latencyClass: "balanced",
      qualityClass: "excellent",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
      multilingual: true,
      visionUnderstanding: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["high", "very_high", "workstation", "extreme"],
    tags: ["premium", "multimodal", "interview", "offline"],
    priority: 60,
    enabledByDefault: false,
  },

  {
    id: "qwen3-32b",
    displayName: "Qwen3 32B",
    family: "Qwen3",
    version: "32B",
    modality: "llm",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 40 * GB,
      recommendedRamBytes: 64 * GB,
      minimumVramBytes: 16 * GB,
      recommendedVramBytes: 24 * GB,
      minimumCpuCores: 12,
      recommendedCpuCores: 16,
      estimatedDiskBytes: 22 * GB,
    },
    performance: {
      latencyClass: "high",
      qualityClass: "excellent",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      textGeneration: true,
      reasoning: true,
      toolCalling: true,
      structuredOutput: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["very_high", "workstation", "extreme"],
    tags: ["workstation", "quality", "offline"],
    priority: 70,
    enabledByDefault: false,
  },

  /*
   * --------------------------------------------------------------------------
   * SPEECH TO TEXT
   * --------------------------------------------------------------------------
   */

  {
    id: "whisper-cpp-tiny",
    displayName: "Whisper.cpp Tiny",
    family: "Whisper",
    version: "tiny",
    modality: "stt",
    runtime: "whisper_cpp",
    availability: "available",
    quantization: "q8",
    requirements: {
      minimumRamBytes: 2 * GB,
      recommendedRamBytes: 4 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 0,
      minimumCpuCores: 2,
      recommendedCpuCores: 4,
      estimatedDiskBytes: 100 * 1024 ** 2,
    },
    performance: {
      latencyClass: "ultra_low",
      qualityClass: "basic",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: false,
    },
    capabilities: {
      speechRecognition: true,
      multilingual: true,
    },
    license: {
      name: "MIT",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["ultra_low", "low", "standard"],
    tags: ["realtime", "low-memory", "stt"],
    priority: 10,
    enabledByDefault: true,
  },

  {
    id: "whisper-cpp-base",
    displayName: "Whisper.cpp Base",
    family: "Whisper",
    version: "base",
    modality: "stt",
    runtime: "whisper_cpp",
    availability: "available",
    quantization: "q8",
    requirements: {
      minimumRamBytes: 2 * GB,
      recommendedRamBytes: 4 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 0,
      minimumCpuCores: 2,
      recommendedCpuCores: 4,
      estimatedDiskBytes: 200 * 1024 ** 2,
    },
    performance: {
      latencyClass: "ultra_low",
      qualityClass: "good",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: false,
    },
    capabilities: {
      speechRecognition: true,
      multilingual: true,
    },
    license: {
      name: "MIT",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["ultra_low", "low", "standard", "high"],
    tags: ["realtime", "stt", "fallback"],
    priority: 20,
    enabledByDefault: true,
  },

  {
    id: "whisper-cpp-small",
    displayName: "Whisper.cpp Small",
    family: "Whisper",
    version: "small",
    modality: "stt",
    runtime: "whisper_cpp",
    availability: "available",
    quantization: "q8",
    requirements: {
      minimumRamBytes: 4 * GB,
      recommendedRamBytes: 8 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 2 * GB,
      minimumCpuCores: 4,
      recommendedCpuCores: 6,
      estimatedDiskBytes: 700 * 1024 ** 2,
    },
    performance: {
      latencyClass: "low",
      qualityClass: "high",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      speechRecognition: true,
      multilingual: true,
    },
    license: {
      name: "MIT",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["low", "standard", "high", "very_high"],
    tags: ["realtime", "quality", "stt"],
    priority: 30,
    enabledByDefault: false,
  },

  {
    id: "whisper-cpp-medium",
    displayName: "Whisper.cpp Medium",
    family: "Whisper",
    version: "medium",
    modality: "stt",
    runtime: "whisper_cpp",
    availability: "available",
    quantization: "q8",
    requirements: {
      minimumRamBytes: 8 * GB,
      recommendedRamBytes: 16 * GB,
      minimumVramBytes: 2 * GB,
      recommendedVramBytes: 6 * GB,
      minimumCpuCores: 6,
      recommendedCpuCores: 8,
      estimatedDiskBytes: 2 * GB,
    },
    performance: {
      latencyClass: "balanced",
      qualityClass: "excellent",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      speechRecognition: true,
      multilingual: true,
    },
    license: {
      name: "MIT",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["standard", "high", "very_high", "workstation"],
    tags: ["quality", "stt"],
    priority: 40,
    enabledByDefault: false,
  },

  {
    id: "whisper-cpp-large-v3-turbo",
    displayName: "Whisper.cpp Large-v3-Turbo",
    family: "Whisper",
    version: "large-v3-turbo",
    modality: "stt",
    runtime: "whisper_cpp",
    availability: "available",
    quantization: "q8",
    requirements: {
      minimumRamBytes: 12 * GB,
      recommendedRamBytes: 24 * GB,
      minimumVramBytes: 4 * GB,
      recommendedVramBytes: 8 * GB,
      minimumCpuCores: 8,
      recommendedCpuCores: 12,
      estimatedDiskBytes: 2 * GB,
    },
    performance: {
      latencyClass: "balanced",
      qualityClass: "excellent",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      speechRecognition: true,
      multilingual: true,
    },
    license: {
      name: "MIT",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["high", "very_high", "workstation", "extreme"],
    tags: ["realtime", "premium", "stt"],
    priority: 50,
    enabledByDefault: false,
  },

  /*
   * --------------------------------------------------------------------------
   * VISION
   * --------------------------------------------------------------------------
   */

  {
    id: "qwen2.5-vl-3b",
    displayName: "Qwen2.5-VL 3B",
    family: "Qwen2.5-VL",
    version: "3B",
    modality: "vision",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 8 * GB,
      recommendedRamBytes: 12 * GB,
      minimumVramBytes: 4 * GB,
      recommendedVramBytes: 6 * GB,
      minimumCpuCores: 4,
      recommendedCpuCores: 8,
      estimatedDiskBytes: 4 * GB,
    },
    performance: {
      latencyClass: "low",
      qualityClass: "good",
      streaming: false,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      visionUnderstanding: true,
      textGeneration: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["low", "standard", "high"],
    tags: ["vision", "on-demand", "screenshots"],
    priority: 20,
    enabledByDefault: false,
  },

  {
    id: "qwen2.5-vl-7b",
    displayName: "Qwen2.5-VL 7B",
    family: "Qwen2.5-VL",
    version: "7B",
    modality: "vision",
    runtime: "ollama",
    availability: "available",
    quantization: "q4",
    requirements: {
      minimumRamBytes: 12 * GB,
      recommendedRamBytes: 20 * GB,
      minimumVramBytes: 6 * GB,
      recommendedVramBytes: 10 * GB,
      minimumCpuCores: 6,
      recommendedCpuCores: 8,
      estimatedDiskBytes: 6 * GB,
    },
    performance: {
      latencyClass: "balanced",
      qualityClass: "high",
      streaming: false,
      batchProcessing: true,
      gpuPreferred: true,
    },
    capabilities: {
      visionUnderstanding: true,
      textGeneration: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: ["standard", "high", "very_high", "workstation"],
    tags: ["vision", "technical", "screenshots"],
    priority: 30,
    enabledByDefault: false,
  },

  /*
   * --------------------------------------------------------------------------
   * TTS
   * --------------------------------------------------------------------------
   */

  {
    id: "kokoro-82m",
    displayName: "Kokoro 82M",
    family: "Kokoro",
    version: "82M",
    modality: "tts",
    runtime: "onnx",
    availability: "available",
    quantization: "fp16",
    requirements: {
      minimumRamBytes: 2 * GB,
      recommendedRamBytes: 4 * GB,
      minimumVramBytes: 0,
      recommendedVramBytes: 0,
      minimumCpuCores: 2,
      recommendedCpuCores: 4,
      estimatedDiskBytes: 500 * 1024 ** 2,
    },
    performance: {
      latencyClass: "low",
      qualityClass: "high",
      streaming: true,
      batchProcessing: true,
      gpuPreferred: false,
    },
    capabilities: {
      textToSpeech: true,
      multilingual: true,
    },
    license: {
      name: "Apache-2.0",
      commercialUse: true,
      redistributionAllowed: true,
      attributionRequired: false,
    },
    supportedHardwareTiers: [
      "ultra_low",
      "low",
      "standard",
      "high",
      "very_high",
      "workstation",
      "extreme",
    ],
    tags: ["tts", "fast", "offline", "fallback"],
    priority: 10,
    enabledByDefault: true,
  },
];


export function getModelPackage(model: ModelDefinition): ModelPackage {
  if (!model.package) {
    throw new Error(
      `Model "${model.id}" does not define an installable package.`,
    );
  }

  return model.package;
}

export function getModelArtifacts(
  model: ModelDefinition,
): readonly ModelArtifact[] {
  return getModelPackage(model).artifacts;
}

// core/models/ModelRegistry.ts

export function getPrimaryModelArtifact(
  model: ModelDefinition,
): ModelArtifact | undefined {
  const artifacts = getModelArtifacts(model);

  return artifacts.find(
    (artifact) => artifact.role === "model",
  );
}

export function getRequiredModelArtifacts(
  model: ModelDefinition,
): readonly ModelArtifact[] {
  const modelPackage = getModelPackage(model);

  const required = new Set(modelPackage.requiredArtifactIds);

  return Object.freeze(
    modelPackage.artifacts.filter((artifact) => required.has(artifact.id)),
  );
}


export class ModelRegistry {
  private readonly models = new Map<string, ModelDefinition>();

  public constructor(
    definitions: readonly ModelDefinition[] = MODEL_DEFINITIONS,
  ) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  public register(model: ModelDefinition): void {
    if (this.models.has(model.id)) {
      throw new Error(`Model "${model.id}" is already registered.`);
    }

    const primaryArtifact =
      model.artifact ??
      model.package?.artifacts.find((artifact) => artifact.role === "model");

    const normalizedModel: ModelDefinition = {
      ...model,
      ...(primaryArtifact
        ? {
            artifact: primaryArtifact,
          }
        : {}),
    };

    this.models.set(model.id, Object.freeze(normalizedModel));
  }

  public unregister(modelId: string): boolean {
    return this.models.delete(modelId);
  }

  public get(modelId: string): ModelDefinition | undefined {
    return this.models.get(modelId);
  }

  public require(modelId: string): ModelDefinition {
    const model = this.get(modelId);

    if (!model) {
      throw new Error(`Model "${modelId}" is not registered.`);
    }

    return model;
  }

  public list(): readonly ModelDefinition[] {
    return [...this.models.values()];
  }

  public listByModality(modality: ModelModality): readonly ModelDefinition[] {
    return this.list().filter((model) => model.modality === modality);
  }

  public listAvailable(): readonly ModelDefinition[] {
    return this.list().filter((model) => model.availability === "available");
  }

  public listForHardwareTier(tier: HardwareTier): readonly ModelDefinition[] {
    return this.listAvailable().filter((model) =>
      model.supportedHardwareTiers.includes(tier),
    );
  }

  public findByTag(tag: string): readonly ModelDefinition[] {
    return this.list().filter((model) => model.tags.includes(tag));
  }

  public has(modelId: string): boolean {
    return this.models.has(modelId);
  }
}

export const defaultModelRegistry = new ModelRegistry();
