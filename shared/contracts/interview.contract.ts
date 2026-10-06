// ============================================================================
// FILE: shared/contracts/interview.contract.ts
//
// PURPOSE:
// Public cross-boundary contract for the Veyra Interview subsystem.
//
// IMPLEMENTATION:
//
//     core/interview/services/InterviewIntelligence.ts
//
// INTERNAL DOMAIN ENGINE:
//
//     core/interview/services/InterviewEngine.ts
//
// ARCHITECTURAL RULE:
//
// The shared contract defines what external consumers are allowed to request.
// It does not expose InterviewClassifier, AnswerBuilder, individual engines,
// ContextManager, CandidateService, or AI providers.
//
// This keeps core/interview internally replaceable without breaking callers.
// ============================================================================

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
  InterviewTask,
  InterviewTaskRequest,
} from "../types/interviews";

// ============================================================================
// ANALYSIS RESPONSE
// ============================================================================

/**
 * Response returned from the public Interview analysis boundary.
 */
export interface InterviewAnalysisResponse {
  readonly analysis: InterviewAnalysis;
}

// ============================================================================
// TASK RESPONSE
// ============================================================================

/**
 * Response returned when a caller explicitly requests task extraction.
 */
export interface InterviewTaskResponse {
  /**
   * Detected task.
   *
   * Undefined is valid when the current conversation does not contain a
   * sufficiently identifiable interview task.
   */
  readonly task?: InterviewTask;
}

// ============================================================================
// INTERVIEW SERVICE
// ============================================================================

/**
 * Public cross-boundary Interview service.
 *
 * Typical consumers:
 *
 * - Electron main process
 * - IPC handlers
 * - copilot orchestration
 * - UI-facing application services
 * - higher-level Veyra orchestration
 *
 * The implementation must remain responsible for:
 *
 * - validation
 * - classification
 * - task detection
 * - candidate/context enrichment
 * - deterministic answer guidance
 *
 * AI answer generation remains outside this contract.
 */
export interface InterviewServiceContract {
  /**
   * Analyze the current conversation as an interview task.
   */
  analyze(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewAnalysisResponse>;

  /**
   * Detect the current interview task without requiring the complete
   * interview-intelligence pipeline.
   */
  detectTask(request: InterviewTaskRequest): Promise<InterviewTaskResponse>;
}
