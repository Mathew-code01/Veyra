// ============================================================================
// FILE: core/cloud/index.ts
// PURPOSE:
// Public barrel for Veyra's cloud infrastructure.
//
// Consumers outside core/cloud should normally import cloud functionality
// from this file rather than reaching deeply into provider implementation
// files.
// ============================================================================

// ============================================================================
// CORE PROVIDER CONTRACTS
// ============================================================================

export type { CloudProvider } from "./CloudProvider";

export type { CloudCapabilities } from "./CloudCapabilities";

export { CloudProviderRegistry } from "./CloudProviderRegistry";

export { CloudGateway } from "./CloudGateway";

// ============================================================================
// CLOUD REQUEST / RESPONSE CONTRACTS
// ============================================================================

export type {
  CloudRequest,
  CloudExecutionOptions,
} from "./contracts/CloudRequest";

export type {
  CloudResponse,
  CloudTextResponse,
  CloudSpeechToTextResponse,
  CloudTextToSpeechResponse,
  CloudEmbeddingResponse,
  CloudDocumentAnalysisResponse,
  CloudUsage,
} from "./contracts/CloudResponse";

export type {
  CloudStream,
  CloudStreamEvent,
  CloudStreamEventType,
} from "./contracts/CloudStream";

export { CloudError } from "./contracts/CloudError";

export type { CloudHealth } from "./contracts/CloudHealth";

export type { CloudRateLimit } from "./contracts/CloudRateLimit";

// ============================================================================
// CREDENTIALS
// ============================================================================

export type {
  CloudCredential,
  CloudCredentialResolver,
} from "./CloudCredential";

export { EnvironmentCloudCredentialResolver } from "./configuration/CloudCredentials";

// ============================================================================
// CONFIGURATION
// ============================================================================

export type { CloudConfig } from "./configuration/CloudConfig";

export type { CloudEnvironment } from "./configuration/CloudEnvironment";

// ============================================================================
// CAPABILITIES
// ============================================================================

export type { CloudCapability } from "./capabilities/CloudCapability";

export type { TextGenerationCapability } from "./capabilities/TextGenerationCapability";

export type { VisionCapability } from "./capabilities/VisionCapability";

export type { SpeechToTextCapability } from "./capabilities/SpeechToTextCapability";

export type { TextToSpeechCapability } from "./capabilities/TextToSpeechCapability";

export type { EmbeddingCapability } from "./capabilities/EmbeddingCapability";

export type { DocumentAnalysisCapability } from "./capabilities/DocumentAnalysisCapability";

// ============================================================================
// DEFAULT PROVIDER REGISTRY
// ============================================================================

export {
  createDefaultCloudProviders,
  registerDefaultCloudProviders,
  createDefaultCloudProviderRegistry,
} from "./registry/defaultCloudProviders";

export type { DefaultCloudProviderOptions } from "./registry/defaultCloudProviders";

// ============================================================================
// DEFAULT MODEL CATALOG
// ============================================================================

export {
  DEFAULT_CLOUD_MODELS,
  getDefaultCloudModels,
  getCloudModelsForProvider,
  getDefaultCloudModel,
  findDefaultCloudModel,
} from "./registry/defaultCloudModels";

export type {
  DefaultCloudModel,
  DefaultCloudModelCapability,
} from "./registry/defaultCloudModels";

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

export { GeminiProvider } from "./providers/Gemini/GeminiProvider";

export { GroqProvider } from "./providers/Groq/GroqProvider";

export { CerebrasProvider } from "./providers/Cerebras/CerebrasProvider";

export { MistralProvider } from "./providers/Mistral/MistralProvider";

export { OpenRouterProvider } from "./providers/OpenRouter/OpenRouterProvider";

export { HuggingFaceProvider } from "./providers/HuggingFace/HuggingFaceProvider";
