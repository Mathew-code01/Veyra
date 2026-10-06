
// ============================================================================
// FILE: core/interview/index.ts
//
// PURPOSE:
// Public barrel for the Interview domain.
// ============================================================================

// --------------------------------------------------------------------------
// ANSWER
// --------------------------------------------------------------------------

export {
  AnswerBuilder,
} from "./answer/AnswerBuilder";

export type {
  AnswerBuilderOptions,
} from "./answer/AnswerBuilder";

// --------------------------------------------------------------------------
// CLASSIFICATION
// --------------------------------------------------------------------------

export {
  InterviewClassifier,
} from "./classification/InterviewClassifier";

// --------------------------------------------------------------------------
// CONTRACTS
// --------------------------------------------------------------------------

export type {
  InterviewClassifier as InterviewClassifierContract,
} from "./contracts/InterviewClassifier";

export type {
  InterviewEngineContract,
} from "./contracts/InterviewEngine";

export type {
  InterviewTaskEngine,
} from "./contracts/InterviewTaskEngine";

// --------------------------------------------------------------------------
// ENGINES
// --------------------------------------------------------------------------

export {
  BehavioralEngine,
} from "./engines/BehavioralEngine";

export {
  CaseEngine,
} from "./engines/CaseEngine";

export {
  CodingEngine,
} from "./engines/CodingEngine";

export {
  CommunicationEngine,
} from "./engines/CommunicationEngine";

export {
  ExperienceEngine,
} from "./engines/ExperienceEngine";

export {
  GeneralEngine,
} from "./engines/GeneralEngine";

export {
  MotivationEngine,
} from "./engines/MotivationEngine";

export {
  ProductEngine,
} from "./engines/ProductEngine";

export {
  SituationalEngine,
} from "./engines/SituationalEngine";

export {
  SystemDesignEngine,
} from "./engines/SystemDesignEngine";

export {
  TechnicalEngine,
} from "./engines/TechnicalEngine";

// --------------------------------------------------------------------------
// ERRORS
// --------------------------------------------------------------------------

export {
  InterviewError,
} from "./errors/InterviewError";

export type {
  InterviewErrorCode,
  InterviewErrorStage,
  InterviewErrorDetails,
} from "./errors/InterviewError";

// --------------------------------------------------------------------------
// SERVICES
// --------------------------------------------------------------------------

export {
  InterviewEngine,
} from "./services/InterviewEngine";

export type {
  InterviewEngineOptions,
} from "./services/InterviewEngine";

export {
  InterviewIntelligence,
} from "./services/InterviewIntelligence";

export type {
  InterviewIntelligenceOptions,
  InterviewIntelligenceResult,
} from "./services/InterviewIntelligence";

// --------------------------------------------------------------------------
// VALIDATION
// --------------------------------------------------------------------------

export {
  InterviewValidator,
} from "./validation/InterviewValidator";
