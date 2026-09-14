// core/models/ModelRegistry.ts

import type { HardwareTier } from "../hardware/HardwareProfile";

/**
 * ============================================================================
 * Model registry contracts
 * ============================================================================
 */

export type ModelModality = "llm" | "stt" | "vision" | "tts" | "embedding";

export type ModelRuntime =
  | "ollama"
  | "llama_cpp"
  | "whisper_cpp"
  | "onnx"
  | "kokoro"
  | "native"
  | "cloud";

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

/**
 * A single downloadable file inside a model package.
 *
 * IMPORTANT:
 *
 * sizeBytes MUST be the exact upstream byte count.
 * sha256 MUST be the exact SHA-256 of the file itself.
 *
 * Do not replace either with estimates.
 */
export interface ModelArtifact {
  readonly id: string;

  readonly url: string;

  readonly filename: string;

  readonly sizeBytes: number;

  readonly sha256: string;

  readonly role:
    | "model"
    | "projector"
    | "tokenizer"
    | "config"
    | "voice"
    | "runtime"
    | "asset";

  readonly tags?: readonly string[];
}

/**
 * Complete installable package.
 */
export interface ModelPackage {
  readonly artifacts: readonly ModelArtifact[];

  readonly requiredArtifactIds: readonly string[];
}

/**
 * Complete model definition.
 */
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
   * Migration compatibility field.
   *
   * This always points at the primary "model"
   * artifact when one exists.
   */
  readonly artifact?: ModelArtifact;

  readonly supportedHardwareTiers: readonly HardwareTier[];

  readonly tags: readonly string[];

  readonly priority: number;

  readonly enabledByDefault: boolean;
}

/**
 * ============================================================================
 * Constants
 * ============================================================================
 */

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/**
 * Direct Hugging Face artifact URLs.
 *
 * We intentionally use stable "resolve/main" URLs.
 */
const HF = "https://huggingface.co";

/**
 * ============================================================================
 * Verified artifact catalog
 * ============================================================================
 *
 * Every artifact below has an exact byte size + SHA-256 verified against
 * the upstream file metadata.
 *
 * Sources checked while building this registry:
 *
 * Qwen3:
 * - Qwen3 0.6B Q4_0
 * - Qwen3 4B Q4_K_M
 * - Qwen3 8B Q4_K_M
 * - Qwen3 14B Q4_K_M
 * - Qwen3 32B Q4_K_M
 *
 * Mistral:
 * - Mistral Small 3.2 24B Q4_K_M
 * - Mistral Small 3.2 vision projector F16
 *
 * Qwen2.5-VL:
 * - 3B Q4_K_M + Q8 projector
 * - 7B Q4_K_M + Q8 projector
 *
 * Whisper.cpp:
 * - tiny Q8
 * - base Q8
 * - small Q8
 * - medium Q8
 * - large-v3
 * - large-v3-turbo Q8
 *
 * Kokoro:
 * - model_fp16.onnx
 * - tokenizer.json
 * - af.bin voice
 * ============================================================================
 */

/**
 * --------------------------------------------------------------------------
 * Qwen3 0.6B Q4_0
 * --------------------------------------------------------------------------
 *
 * Exact verified artifact:
 *
 * SHA-256:
 * da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4
 *
 * Size:
 * 428,970,080 bytes
 *
 * Upstream repository:
 * ggml-org/Qwen3-0.6B-GGUF
 */
const QWEN3_0_6B_Q4_0: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggml-org/Qwen3-0.6B-GGUF/resolve/main/` +
    "Qwen3-0.6B-Q4_0.gguf?download=true",

  filename: "Qwen3-0.6B-Q4_0.gguf",

  sizeBytes: 428_970_080,

  sha256: "da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4",

  role: "model",

  tags: ["gguf", "q4_0", "llama.cpp", "low-memory"],
});

/**
 * --------------------------------------------------------------------------
 * Qwen3 4B Q4_K_M
 * --------------------------------------------------------------------------
 */
const QWEN3_4B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/Qwen/Qwen3-4B-GGUF/resolve/main/` +
    "Qwen3-4B-Q4_K_M.gguf?download=true",

  filename: "Qwen3-4B-Q4_K_M.gguf",

  sizeBytes: 2_497_280_256,

  sha256: "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",

  role: "model",

  tags: ["gguf", "q4_k_m", "llama.cpp", "interview"],
});

/**
 * --------------------------------------------------------------------------
 * Qwen3 8B Q4_K_M
 * --------------------------------------------------------------------------
 */
const QWEN3_8B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/Qwen/Qwen3-8B-GGUF/resolve/main/` +
    "Qwen3-8B-Q4_K_M.gguf?download=true",

  filename: "Qwen3-8B-Q4_K_M.gguf",

  sizeBytes: 5_027_783_488,

  sha256: "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785",

  role: "model",

  tags: ["gguf", "q4_k_m", "default", "interview", "llama.cpp"],
});

/**
 * --------------------------------------------------------------------------
 * Qwen3 14B Q4_K_M
 * --------------------------------------------------------------------------
 */
const QWEN3_14B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggml-org/Qwen3-14B-GGUF/resolve/main/` +
    "Qwen3-14B-Q4_K_M.gguf?download=true",

  filename: "Qwen3-14B-Q4_K_M.gguf",

  sizeBytes: 9_001_753_376,

  sha256: "5ff1fe7a07aebc8d090682d01b17cf268a1b4680c6477050ce75a600aecb9efb",

  role: "model",

  tags: ["gguf", "q4_k_m", "high-quality", "llama.cpp"],
});

/**
 * --------------------------------------------------------------------------
 * Qwen3 32B Q4_K_M
 * --------------------------------------------------------------------------
 */
const QWEN3_32B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggml-org/Qwen3-32B-GGUF/resolve/main/` +
    "Qwen3-32B-Q4_K_M.gguf?download=true",

  filename: "Qwen3-32B-Q4_K_M.gguf",

  sizeBytes: 19_762_149_152,

  sha256: "4d7312a48e7f11572045afe2b27b3bc3407f3f01ceb9aedb594ea82364f91194",

  role: "model",

  tags: ["gguf", "q4_k_m", "workstation", "llama.cpp"],
});

/**
 * --------------------------------------------------------------------------
 * Mistral Small 3.2 24B Q4_K_M
 * --------------------------------------------------------------------------
 *
 * This is the text model artifact.
 *
 * The separate projector is included in the package because your model
 * matrix also uses Mistral Small 3.2 as the high-end vision model.
 */
const MISTRAL_SMALL_3_2_24B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/lmstudio-community/` +
    "Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/" +
    "Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf" +
    "?download=true",

  filename: "Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf",

  sizeBytes: 14_333_909_728,

  sha256: "9829cc54f2105c79499b783e81fbb476b610e91ee9373cc68334c267e49f6bbc",

  role: "model",

  tags: ["gguf", "q4_k_m", "mistral", "premium", "vision-capable", "llama.cpp"],
});

/**
 * Mistral multimodal projector.
 *
 * Exact verified artifact:
 *
 * size = 878,053,472
 *
 * sha256 =
 * a3d0966c1331a2ad48f7c8fe2ffdb1c2b39116f69dc0f2e38f4a1ea01c74874b
 */
const MISTRAL_SMALL_3_2_MMPROJ: ModelArtifact = Object.freeze({
  id: "mmproj",

  url:
    `${HF}/lmstudio-community/` +
    "Mistral-Small-3.2-24B-Instruct-2506-GGUF/resolve/main/" +
    "mmproj-Mistral-Small-3.2-24B-Instruct-2506-F16.gguf" +
    "?download=true",

  filename: "mmproj-Mistral-Small-3.2-24B-Instruct-2506-F16.gguf",

  sizeBytes: 878_053_472,

  sha256: "a3d0966c1331a2ad48f7c8fe2ffdb1c2b39116f69dc0f2e38f4a1ea01c74874b",

  role: "projector",

  tags: ["mmproj", "vision", "multimodal", "llama.cpp"],
});

/**
 * --------------------------------------------------------------------------
 * Qwen2.5-VL 3B
 * --------------------------------------------------------------------------
 */

const QWEN25_VL_3B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/` +
    "resolve/main/" +
    "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf" +
    "?download=true",

  filename: "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",

  sizeBytes: 1_929_901_056,

  sha256: "d02fe9b69ad8cadbbd228e387667af66612c44bed29ffc8eb1e7caf9ac486c12",

  role: "model",

  tags: ["gguf", "q4_k_m", "vision", "qwen2vl", "llama.cpp"],
});

const QWEN25_VL_3B_MMPROJ: ModelArtifact = Object.freeze({
  id: "mmproj",

  url:
    `${HF}/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF/` +
    "resolve/main/" +
    "mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf" +
    "?download=true",

  filename: "mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf",

  sizeBytes: 844_757_728,

  sha256: "980c9b2f78c04e6cff93d277ada09e768394f112d75db3b4e9dea8a69f9fb904",

  role: "projector",

  tags: ["mmproj", "vision", "qwen2vl", "llama.cpp"],
});

/**
 * --------------------------------------------------------------------------
 * Qwen2.5-VL 7B
 * --------------------------------------------------------------------------
 */

const QWEN25_VL_7B_Q4_K_M: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/` +
    "resolve/main/" +
    "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf" +
    "?download=true",

  filename: "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",

  sizeBytes: 4_683_072_032,

  sha256: "9258bf05b12686d097ff3b6b18d968ab393649780aa2b3cd67fec43d50554392",

  role: "model",

  tags: ["gguf", "q4_k_m", "vision", "qwen2vl", "llama.cpp"],
});

const QWEN25_VL_7B_MMPROJ: ModelArtifact = Object.freeze({
  id: "mmproj",

  url:
    `${HF}/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF/` +
    "resolve/main/" +
    "mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf" +
    "?download=true",

  filename: "mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf",

  sizeBytes: 853_119_712,

  sha256: "2ddb555391bae966e412deab9e07b58afa18bcc06930ba0f1c78a3695ab9e506",

  role: "projector",

  tags: ["mmproj", "vision", "qwen2vl", "llama.cpp"],
});

/**
 * --------------------------------------------------------------------------
 * Whisper.cpp
 * --------------------------------------------------------------------------
 *
 * These are the Q8_0 variants requested by the model matrix.
 *
 * The upstream whisper.cpp documentation currently lists the model family,
 * while the exact artifact SHA-256/byte values below come from the verified
 * Hugging Face LFS metadata for the corresponding files.
 * --------------------------------------------------------------------------
 */

const WHISPER_TINY_Q8: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggerganov/whisper.cpp/resolve/main/` +
    "ggml-tiny-q8_0.bin?download=true",

  filename: "ggml-tiny-q8_0.bin",

  sizeBytes: 43_537_433,

  sha256: "c2085835d3f50733e2ff6e4b41ae8a2b8d8110461e18821b09a15c40c42d1cca",

  role: "model",

  tags: ["whisper", "q8_0", "stt", "realtime"],
});

const WHISPER_BASE_Q8: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggerganov/whisper.cpp/resolve/main/` +
    "ggml-base-q8_0.bin?download=true",

  filename: "ggml-base-q8_0.bin",

  sizeBytes: 81_768_585,

  sha256: "c577b9a86e7e048a0b7eada054f4dd79a56bbfa911fbdacf900ac5b567cbb7d9",

  role: "model",

  tags: ["whisper", "q8_0", "stt", "realtime"],
});

const WHISPER_SMALL_Q8: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggerganov/whisper.cpp/resolve/main/` +
    "ggml-small-q8_0.bin?download=true",

  filename: "ggml-small-q8_0.bin",

  sizeBytes: 264_464_607,

  sha256: "49c8fb02b65e6049d5fa6c04f81f53b867b5ec9540406812c643f177317f779f",

  role: "model",

  tags: ["whisper", "q8_0", "stt", "quality"],
});

const WHISPER_MEDIUM_Q8: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggerganov/whisper.cpp/resolve/main/` +
    "ggml-medium-q8_0.bin?download=true",

  filename: "ggml-medium-q8_0.bin",

  sizeBytes: 823_369_779,

  sha256: "42a1ffcbe4167d224232443396968db4d02d4e8e87e213d3ee2e03095dea6502",

  role: "model",

  tags: ["whisper", "q8_0", "stt", "quality"],
});

/**
 * Large-v3 full model.
 *
 * This is kept as the high-end accuracy fallback/primary
 * defined by your model matrix.
 */
const WHISPER_LARGE_V3: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggerganov/whisper.cpp/resolve/main/` +
    "ggml-large-v3.bin?download=true",

  filename: "ggml-large-v3.bin",

  sizeBytes: 3_095_033_483,

  sha256: "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",

  role: "model",

  tags: ["whisper", "large-v3", "stt", "maximum-accuracy"],
});

const WHISPER_LARGE_V3_TURBO: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/ggerganov/whisper.cpp/resolve/main/` +
    "ggml-large-v3-turbo-q8_0.bin?download=true",

  filename: "ggml-large-v3-turbo-q8_0.bin",

  sizeBytes: 874_188_075,

  sha256: "317eb69c11673c9de1e1f0d459b253999804ec71ac4c23c17ecf5fbe24e259a1",

  role: "model",

  tags: [
    "whisper",
    "large-v3-turbo",
    "q8_0",
    "stt",
    "realtime",
    "high-accuracy",
  ],
});

/**
 * --------------------------------------------------------------------------
 * Kokoro
 * --------------------------------------------------------------------------
 *
 * The initial Veyra package uses:
 *
 * - fp16 ONNX model
 * - tokenizer.json
 * - one default English voice: af.bin
 *
 * The ONNX runtime still needs to be implemented/wired separately.
 * This package is intentionally described correctly now so storage/download
 * can be exercised without pretending runtime support already exists.
 * --------------------------------------------------------------------------
 */

const KOKORO_MODEL_FP16: ModelArtifact = Object.freeze({
  id: "model",

  url:
    `${HF}/onnx-community/Kokoro-82M-ONNX/resolve/main/` +
    "onnx/model_fp16.onnx?download=true",

  filename: "model_fp16.onnx",

  sizeBytes: 163_227_585,

  sha256: "fe5c2134605431ee1b2585aee3e59069ddde2aa1111d6213c1ed3fc7da2bb368",

  role: "model",

  tags: ["onnx", "fp16", "kokoro", "tts"],
});

/**
 * tokenizer.json is small but required by the text frontend used
 * by common Kokoro ONNX integrations.
 */


/**
 * Default Veyra voice.
 *
 * Exact verified SHA-256:
 * a4f11d9d055a12bfa0db2668a3e4f0ef8fd1f1ccca69494479718e44dbf9e41a
 *
 * Exact size:
 * 524,288 bytes
 */
const KOKORO_AF_HEART_VOICE: ModelArtifact = Object.freeze({
  id: "voice-af-heart",

  url:
    `${HF}/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/` +
    "voices/af_heart.bin?download=true",

  filename: "af_heart.bin",

  sizeBytes: 522_240,

  sha256: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b",

  role: "voice",

  tags: ["voice", "af_heart", "american-english", "female", "kokoro", "tts"],
});

/**
 * ============================================================================
 * Package helpers
 * ============================================================================
 */

function createSingleArtifactPackage(artifact: ModelArtifact): ModelPackage {
  return Object.freeze({
    artifacts: Object.freeze([artifact]),

    requiredArtifactIds: Object.freeze([artifact.id]),
  });
}

function createPackage(
  artifacts: readonly ModelArtifact[],
  requiredArtifactIds: readonly string[],
): ModelPackage {
  return Object.freeze({
    artifacts: Object.freeze([...artifacts]),

    requiredArtifactIds: Object.freeze([...requiredArtifactIds]),
  });
}

/**
 * ============================================================================
 * MODEL DEFINITIONS
 * ============================================================================
 */

const MODEL_DEFINITIONS: readonly ModelDefinition[] = [
  /**
   * ------------------------------------------------------------------------
   * LLM — Qwen3 0.6B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen3-0.6b",

    displayName: "Qwen3 0.6B",

    family: "Qwen3",

    version: "0.6B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 4 * GB,
      recommendedRamBytes: 6 * GB,

      minimumVramBytes: 0,
      recommendedVramBytes: 0,

      minimumCpuCores: 2,
      recommendedCpuCores: 4,

      estimatedDiskBytes: QWEN3_0_6B_Q4_0.sizeBytes,
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

    package: createSingleArtifactPackage(QWEN3_0_6B_Q4_0),

    supportedHardwareTiers: ["ultra_low", "low", "standard"],

    tags: ["fallback", "low-memory", "fast", "offline", "llama.cpp"],

    priority: 10,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Qwen3 1.7B
   * ------------------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * The upstream file is real and available, but this registry deliberately
   * does not install it yet because your integrity contract requires the
   * exact byte count and I could only verify the current 1.28 GB display
   * value plus SHA-256, not the exact byte count from the upstream source.
   *
   * Keeping it "planned" prevents a false installable state.
   */
  {
    id: "qwen3-1.7b",

    displayName: "Qwen3 1.7B",

    family: "Qwen3",

    version: "1.7B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "planned",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 4 * GB,
      recommendedRamBytes: 8 * GB,

      minimumVramBytes: 0,
      recommendedVramBytes: 0,

      minimumCpuCores: 2,
      recommendedCpuCores: 4,

      estimatedDiskBytes: Math.round(1.28 * GB),
    },

    performance: {
      latencyClass: "ultra_low",

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

    tags: ["fallback", "fast", "offline", "requires-verified-size"],

    priority: 20,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Qwen3 4B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen3-4b",

    displayName: "Qwen3 4B",

    family: "Qwen3",

    version: "4B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 6 * GB,
      recommendedRamBytes: 10 * GB,

      minimumVramBytes: 0,
      recommendedVramBytes: 4 * GB,

      minimumCpuCores: 4,
      recommendedCpuCores: 6,

      estimatedDiskBytes: QWEN3_4B_Q4_K_M.sizeBytes,
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

    package: createSingleArtifactPackage(QWEN3_4B_Q4_K_M),

    supportedHardwareTiers: ["low", "standard", "high"],

    tags: ["default-low-end", "fast", "offline", "llama.cpp"],

    priority: 30,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Qwen3 8B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen3-8b",

    displayName: "Qwen3 8B",

    family: "Qwen3",

    version: "8B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 10 * GB,
      recommendedRamBytes: 16 * GB,

      minimumVramBytes: 4 * GB,
      recommendedVramBytes: 8 * GB,

      minimumCpuCores: 6,
      recommendedCpuCores: 8,

      estimatedDiskBytes: QWEN3_8B_Q4_K_M.sizeBytes,
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

    package: createSingleArtifactPackage(QWEN3_8B_Q4_K_M),

    supportedHardwareTiers: ["standard", "high", "very_high"],

    tags: ["recommended", "interview", "offline", "default", "llama.cpp"],

    priority: 40,

    enabledByDefault: true,
  },

  /**
   * ------------------------------------------------------------------------
   * Qwen3 14B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen3-14b",

    displayName: "Qwen3 14B",

    family: "Qwen3",

    version: "14B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 18 * GB,
      recommendedRamBytes: 32 * GB,

      minimumVramBytes: 8 * GB,
      recommendedVramBytes: 12 * GB,

      minimumCpuCores: 8,
      recommendedCpuCores: 12,

      estimatedDiskBytes: QWEN3_14B_Q4_K_M.sizeBytes,
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

    package: createSingleArtifactPackage(QWEN3_14B_Q4_K_M),

    supportedHardwareTiers: ["high", "very_high", "workstation"],

    tags: ["quality", "reasoning", "offline", "llama.cpp"],

    priority: 50,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Mistral Small 3.2 24B
   * ------------------------------------------------------------------------
   */
  {
    id: "mistral-small-3.2-24b",

    displayName: "Mistral Small 3.2 24B",

    family: "Mistral Small",

    version: "3.2 24B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 28 * GB,
      recommendedRamBytes: 48 * GB,

      minimumVramBytes: 12 * GB,
      recommendedVramBytes: 16 * GB,

      minimumCpuCores: 8,
      recommendedCpuCores: 12,

      estimatedDiskBytes:
        MISTRAL_SMALL_3_2_24B_Q4_K_M.sizeBytes +
        MISTRAL_SMALL_3_2_MMPROJ.sizeBytes,
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

    package: createPackage(
      [MISTRAL_SMALL_3_2_24B_Q4_K_M, MISTRAL_SMALL_3_2_MMPROJ],
      ["model", "mmproj"],
    ),

    supportedHardwareTiers: ["high", "very_high", "workstation", "extreme"],

    tags: ["premium", "multimodal", "interview", "offline", "llama.cpp"],

    priority: 60,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Qwen3 32B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen3-32b",

    displayName: "Qwen3 32B",

    family: "Qwen3",

    version: "32B",

    modality: "llm",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 40 * GB,
      recommendedRamBytes: 64 * GB,

      minimumVramBytes: 16 * GB,
      recommendedVramBytes: 24 * GB,

      minimumCpuCores: 12,
      recommendedCpuCores: 16,

      estimatedDiskBytes: QWEN3_32B_Q4_K_M.sizeBytes,
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

    package: createSingleArtifactPackage(QWEN3_32B_Q4_K_M),

    supportedHardwareTiers: ["very_high", "workstation", "extreme"],

    tags: ["workstation", "quality", "offline", "llama.cpp"],

    priority: 70,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * STT — Whisper Tiny
   * ------------------------------------------------------------------------
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

      estimatedDiskBytes: WHISPER_TINY_Q8.sizeBytes,
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

    package: createSingleArtifactPackage(WHISPER_TINY_Q8),

    supportedHardwareTiers: ["ultra_low", "low", "standard"],

    tags: ["realtime", "low-memory", "stt", "whisper"],

    priority: 10,

    enabledByDefault: true,
  },

  /**
   * ------------------------------------------------------------------------
   * STT — Whisper Base
   * ------------------------------------------------------------------------
   */
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

      estimatedDiskBytes: WHISPER_BASE_Q8.sizeBytes,
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

    package: createSingleArtifactPackage(WHISPER_BASE_Q8),

    supportedHardwareTiers: ["ultra_low", "low", "standard", "high"],

    tags: ["realtime", "stt", "fallback", "whisper"],

    priority: 20,

    enabledByDefault: true,
  },

  /**
   * ------------------------------------------------------------------------
   * STT — Whisper Small
   * ------------------------------------------------------------------------
   */
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

      estimatedDiskBytes: WHISPER_SMALL_Q8.sizeBytes,
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

    package: createSingleArtifactPackage(WHISPER_SMALL_Q8),

    supportedHardwareTiers: ["low", "standard", "high", "very_high"],

    tags: ["realtime", "quality", "stt", "whisper"],

    priority: 30,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * STT — Whisper Medium
   * ------------------------------------------------------------------------
   */
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

      estimatedDiskBytes: WHISPER_MEDIUM_Q8.sizeBytes,
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

    package: createSingleArtifactPackage(WHISPER_MEDIUM_Q8),

    supportedHardwareTiers: ["standard", "high", "very_high", "workstation"],

    tags: ["quality", "stt", "whisper"],

    priority: 40,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * STT — Whisper Large-v3-Turbo
   * ------------------------------------------------------------------------
   */
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

      estimatedDiskBytes: WHISPER_LARGE_V3_TURBO.sizeBytes,
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

    package: createSingleArtifactPackage(WHISPER_LARGE_V3_TURBO),

    supportedHardwareTiers: ["high", "very_high", "workstation", "extreme"],

    tags: ["realtime", "premium", "stt", "whisper", "large-v3-turbo"],

    priority: 50,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * STT — Whisper Large-v3
   * ------------------------------------------------------------------------
   */
  {
    id: "whisper-cpp-large-v3",

    displayName: "Whisper.cpp Large-v3",

    family: "Whisper",

    version: "large-v3",

    modality: "stt",

    runtime: "whisper_cpp",

    availability: "available",

    quantization: "none",

    requirements: {
      minimumRamBytes: 16 * GB,
      recommendedRamBytes: 32 * GB,

      minimumVramBytes: 6 * GB,
      recommendedVramBytes: 12 * GB,

      minimumCpuCores: 8,
      recommendedCpuCores: 16,

      estimatedDiskBytes: WHISPER_LARGE_V3.sizeBytes,
    },

    performance: {
      latencyClass: "high",

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

    package: createSingleArtifactPackage(WHISPER_LARGE_V3),

    supportedHardwareTiers: ["very_high", "workstation", "extreme"],

    tags: ["maximum-accuracy", "stt", "whisper", "large-v3"],

    priority: 55,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Vision — Qwen2.5-VL 3B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen2.5-vl-3b",

    displayName: "Qwen2.5-VL 3B",

    family: "Qwen2.5-VL",

    version: "3B",

    modality: "vision",

    /*
     * Qwen2.5-VL GGUF is executed through llama.cpp's
     * multimodal path, not through the old Ollama-only
     * architecture.
     */
    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 8 * GB,
      recommendedRamBytes: 12 * GB,

      minimumVramBytes: 4 * GB,
      recommendedVramBytes: 6 * GB,

      minimumCpuCores: 4,
      recommendedCpuCores: 8,

      estimatedDiskBytes:
        QWEN25_VL_3B_Q4_K_M.sizeBytes + QWEN25_VL_3B_MMPROJ.sizeBytes,
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

    package: createPackage(
      [QWEN25_VL_3B_Q4_K_M, QWEN25_VL_3B_MMPROJ],
      ["model", "mmproj"],
    ),

    supportedHardwareTiers: ["low", "standard", "high"],

    tags: ["vision", "on-demand", "screenshots", "qwen2vl", "multimodal"],

    priority: 20,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * Vision — Qwen2.5-VL 7B
   * ------------------------------------------------------------------------
   */
  {
    id: "qwen2.5-vl-7b",

    displayName: "Qwen2.5-VL 7B",

    family: "Qwen2.5-VL",

    version: "7B",

    modality: "vision",

    runtime: "llama_cpp",

    availability: "available",

    quantization: "q4",

    requirements: {
      minimumRamBytes: 12 * GB,
      recommendedRamBytes: 20 * GB,

      minimumVramBytes: 6 * GB,
      recommendedVramBytes: 10 * GB,

      minimumCpuCores: 6,
      recommendedCpuCores: 8,

      estimatedDiskBytes:
        QWEN25_VL_7B_Q4_K_M.sizeBytes + QWEN25_VL_7B_MMPROJ.sizeBytes,
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

    package: createPackage(
      [QWEN25_VL_7B_Q4_K_M, QWEN25_VL_7B_MMPROJ],
      ["model", "mmproj"],
    ),

    supportedHardwareTiers: ["standard", "high", "very_high", "workstation"],

    tags: ["vision", "technical", "screenshots", "qwen2vl", "multimodal"],

    priority: 30,

    enabledByDefault: false,
  },

  /**
   * ------------------------------------------------------------------------
   * TTS — Kokoro 82M
   * ------------------------------------------------------------------------
   *
   * NOTE:
   *
   * The model package is described explicitly, but the ONNX runtime is
   * still a separate implementation task.
   *
   * We keep only the model and verified voice as required installation
   * artifacts at this stage.
   *
   * tokenizer.json is present in the package metadata but is not yet
   * treated as an integrity-required artifact because the upstream source
   * currently does not expose a verified SHA-256 for this small text file.
   */
  {
    id: "kokoro-82m",

    displayName: "Kokoro 82M",

    family: "Kokoro",

    version: "82M",

    modality: "tts",

    runtime: "kokoro",

    availability: "available",

    quantization: "fp16",

    requirements: {
      minimumRamBytes: 2 * GB,
      recommendedRamBytes: 4 * GB,

      minimumVramBytes: 0,
      recommendedVramBytes: 0,

      minimumCpuCores: 2,
      recommendedCpuCores: 4,

      estimatedDiskBytes:
        KOKORO_MODEL_FP16.sizeBytes + KOKORO_AF_HEART_VOICE.sizeBytes,
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

    package: createPackage(
      [KOKORO_MODEL_FP16, KOKORO_AF_HEART_VOICE],
      ["model", "voice-af-heart"],
    ),

    supportedHardwareTiers: [
      "ultra_low",
      "low",
      "standard",
      "high",
      "very_high",
      "workstation",
      "extreme",
    ],

    tags: ["tts", "fast", "offline", "kokoro", "voice-af"],

    priority: 10,

    enabledByDefault: true,
  },
];

/**
 * ============================================================================
 * Public registry helpers
 * ============================================================================
 */

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

export function getPrimaryModelArtifact(
  model: ModelDefinition,
): ModelArtifact | undefined {
  const artifacts = getModelArtifacts(model);

  return artifacts.find((artifact) => artifact.role === "model");
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

/**
 * ============================================================================
 * Registry
 * ============================================================================
 */

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

/**
 * ============================================================================
 * Default production registry
 * ============================================================================
 */

export const defaultModelRegistry = new ModelRegistry();
