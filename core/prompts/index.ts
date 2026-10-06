// ============================================================================
// FILE: core/prompts/index.ts
//
// PURPOSE:
// Public barrel for the Veyra Prompt subsystem.
//
// External consumers should import from this file instead of reaching into
// internal prompt implementation directories.
// ============================================================================

// ============================================================================
// CONTRACTS
// ============================================================================

export type { PromptBuilder } from "./contracts/PromptBuilder";

export type { PromptTemplate } from "./contracts/PromptTemplate";

export type {
  PromptFamily,
  PromptKind,
  PromptSource,
  PromptCandidateEvidence,
  PromptContextEvidence,
  PromptBuildInput,
  PromptResponseStyle,
  PromptSection,
  PromptInstructionSet,
  PromptGenerationSettings,
  PromptAIRequestOptions,
  PromptBuildResult,
  PromptTemplateContext,
} from "./contracts/PromptTypes";

// ============================================================================
// BUILDERS
// ============================================================================

export { InterviewPromptBuilder } from "./builders/InterviewPromptBuilder";

export { SystemPromptBuilder } from "./builders/SystemPromptBuilder";

export { VisionPromptBuilder } from "./builders/VisionPromptBuilder";

// ============================================================================
// SERVICES
// ============================================================================

export { PromptService } from "./services/PromptService";

export type { PromptServiceOptions } from "./services/PromptService";

// ============================================================================
// REGISTRY
// ============================================================================

export { PromptRegistry } from "./registry/PromptRegistry";

// ============================================================================
// NORMALIZATION
// ============================================================================

export { PromptNormalizer } from "./normalization/PromptNormalizer";

// ============================================================================
// TEMPLATES
// ============================================================================

export {
  INTERVIEW_PROMPT_TEMPLATES,
  getInterviewPromptTemplate,
  BEHAVIORAL_PROMPT_TEMPLATE,
  CASE_PROMPT_TEMPLATE,
  CODING_PROMPT_TEMPLATE,
  COMMUNICATION_PROMPT_TEMPLATE,
  EXPERIENCE_PROMPT_TEMPLATE,
  GENERAL_PROMPT_TEMPLATE,
  MOTIVATION_PROMPT_TEMPLATE,
  PRODUCT_PROMPT_TEMPLATE,
  SITUATIONAL_PROMPT_TEMPLATE,
  SYSTEM_DESIGN_PROMPT_TEMPLATE,
  TECHNICAL_PROMPT_TEMPLATE,
} from "./templates/interview";

export { DEFAULT_SYSTEM_TEMPLATE } from "./templates/system/default";

export { DEFAULT_VISION_TEMPLATE } from "./templates/vision/default";
