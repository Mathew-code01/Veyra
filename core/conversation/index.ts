// ============================================================================
// FILE: core/conversation/index.ts
// PURPOSE:
// Public exports for the conversation domain.
// ============================================================================

// ============================================================================
// CONTRACTS
// ============================================================================

export * from "./contracts/ConversationAnalyzer";

// ============================================================================
// ERRORS
// ============================================================================

export * from "./errors/ConversationError";

// ============================================================================
// NORMALIZATION
// ============================================================================

export * from "./normalization/ConversationTextNormalizer";

// ============================================================================
// DETECTORS
// ============================================================================

export * from "./detectors/ClarificationDetector";
export * from "./detectors/FollowUpDetector";
export * from "./detectors/QuestionDetector";
export * from "./detectors/RepetitionDetector";

// ============================================================================
// CLASSIFICATION
// ============================================================================

export * from "./classification/IntentClassifier";
export * from "./classification/QuestionClassifier";

// ============================================================================
// STATE
// ============================================================================

export * from "./state/ConversationMemory";

// ============================================================================
// TRACKING
// ============================================================================

export * from "./tracking/TopicTracker";

// ============================================================================
// SERVICES
// ============================================================================

export * from "./services/ConversationAnalyzer";
export * from "./services/ConversationManager";
export * from "./services/ConversationService";

// ============================================================================
// VALIDATION
// ============================================================================

export * from "./validation/ConversationValidator";

// ============================================================================
// AUDIO INTEGRATION
// ============================================================================

export * from "./adapters/AudioTranscriptMapper";
export * from "./adapters/AudioConversationBridge";
