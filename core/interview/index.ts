
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

// --------------------------------------------------------------------------
// PROFESSIONAL DOMAINS, UNDERSTANDING, PLANNING & EVALUATION
// --------------------------------------------------------------------------

export {
  ProfessionalDomainClassifier,
} from "./classification/ProfessionalDomainClassifier";

export {
  QuestionUnderstandingEngine,
} from "./understanding/QuestionUnderstandingEngine";

export {
  AnswerPlanningEngine,
} from "./planning/AnswerPlanningEngine";
export type {
  CandidateEvidenceItem,
} from "./planning/AnswerPlanningEngine";

export {
  AnswerEvaluationEngine,
} from "./evaluation/AnswerEvaluationEngine";
export type {
  AnswerEvaluationInput,
} from "./evaluation/AnswerEvaluationEngine";

export {
  CommunicationAssistanceEngine,
} from "./communication/CommunicationAssistanceEngine";

export {
  FollowUpIntelligenceEngine,
} from "./followup/FollowUpIntelligenceEngine";

export {
  PracticeSessionEngine,
} from "./practice/PracticeSessionEngine";
export type {
  PracticeSessionConfig,
  PracticeSessionState,
  PracticeAnswerResult,
  PracticeQuestionView,
} from "./practice/PracticeSessionEngine";

export {
  UnifiedInterviewRuntime,
} from "./runtime/UnifiedInterviewRuntime";

export type {
  UnifiedInterviewRuntimeOptions,
  UnifiedInterviewSessionConfig,
  InterviewRuntimeMode,
  InterviewInputSource,
  InterviewRuntimeEvidence,
  InterviewRuntimeResponse,
  InterviewRuntimeAnswerResult,
  RuntimeSessionState,
} from "./runtime/UnifiedInterviewRuntime";
