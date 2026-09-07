// shared/index.ts

/**
 * Veyra Shared API
 *
 * This module is the public contract boundary shared by:
 *
 * - React client
 * - Electron desktop
 * - Node server
 * - Core domain/AI engine
 *
 * Avoid adding duplicate wildcard exports here.
 * Every exported symbol should have one canonical owner.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

export * from "./constants/errorCodes";

export { IPC_CHANNELS, IPC_EVENTS } from "./constants/events";

export type { IPCChannel, IPCEvent } from "./constants/events";

export {
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPE_DESCRIPTIONS,
  isInterviewType,
} from "./constants/interviewTypes";

export type { InterviewType } from "./constants/interviewTypes";

export {
  AI_PROVIDERS as SUPPORTED_AI_PROVIDERS,
  MODEL_NAMES,
  DEFAULT_MODELS,
  MODEL_CAPABILITIES,
  MODEL_DEFINITIONS,
  getDefaultModel,
} from "./constants/modelNames";

export type {
  ModelName,
  ModelCapability,
  ModelDefinition,
} from "./constants/modelNames";

/* -------------------------------------------------------------------------- */
/* Common types                                                               */
/* -------------------------------------------------------------------------- */

export * from "./types/common";

/* -------------------------------------------------------------------------- */
/* AI types                                                                    */
/* -------------------------------------------------------------------------- */

export { AI_PROVIDERS, isAIProvider } from "./types/ai";

export type {
  AIProvider,
  AIRequestMode,
  AIMessageRole,
  AIMessage,
  AIMetadata,
  AIRequest,
  AIUsage,
  AIFinishReason,
  AIResponse,
  AIStreamChunk,
  AIStreamStatus,
  AIStreamStart,
  AIHealthState,
  AIHealthStatus,
  AIProviderCapabilities,
  AIProviderStatus,
} from "./types/ai";

/* -------------------------------------------------------------------------- */
/* Audio                                                                       */
/* -------------------------------------------------------------------------- */

export * from "./types/audio";

/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */

export * from "./types/capture";

/* -------------------------------------------------------------------------- */
/* Conversation                                                                */
/* -------------------------------------------------------------------------- */

export * from "./types/conversation";

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

export * from "./types/documents";

/* -------------------------------------------------------------------------- */
/* Interviews                                                                 */
/* -------------------------------------------------------------------------- */

export * from "./types/interviews";

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export * from "./types/sessions";

/* -------------------------------------------------------------------------- */
/* Vision                                                                     */
/* -------------------------------------------------------------------------- */

export * from "./types/vision";

/* -------------------------------------------------------------------------- */
/* Contracts                                                                  */
/* -------------------------------------------------------------------------- */

export * from "./contracts/ai.contract";

export * from "./contracts/document.contract";

export * from "./contracts/profile.contract";

export * from "./contracts/session.contract";

/* -------------------------------------------------------------------------- */
/* Validation schemas                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Validation exports are deliberately explicit.
 *
 * aiProviderSchema is owned by aiSchemas.ts.
 * Do not re-export another aiProviderSchema from another schema module.
 */
export {
  aiProviderSchema,
  aiRequestModeSchema,
  aiMessageSchema,
  aiRequestSchema,
  aiCancelStreamSchema,
  aiProviderStatusRequestSchema,
} from "./validation/aiSchemas";

export type { AIRequestInput } from "./validation/aiSchemas";

export * from "./validation/documentSchemas";

export * from "./validation/profileSchemas";

export * from "./validation/sessionSchemas";
