
// ============================================================================
// FILE: core/interview/services/InterviewEngine.ts
//
// PURPOSE:
// Main Interview application service.
//
// FLOW:
//
//     ConversationAnalysis
//            ↓
//     validation
//            ↓
//     classification
//            ↓
//     task engine
//            ↓
//     InterviewTask
//            ↓
//     AnswerBuilder
//            ↓
//     InterviewAnalysis
//
// PUBLIC CONTRACT:
//
// InterviewEngine implements InterviewServiceContract.
//
// The public contract exposes:
//
//     analyze()
//     detectTask()
//
// INTERNAL RESPONSIBILITIES:
//
// - conversation validation
// - interview classification
// - task-engine selection
// - interview-task construction
// - deterministic answer guidance
// - confidence calculation
// - interview-specific signals
//
// This service does NOT:
//
// - own conversation state
// - retrieve candidate records
// - retrieve context
// - build AI prompts
// - call AI providers
// - select AI models
// - perform provider routing
//
// Those responsibilities belong to their respective subsystems.
// ============================================================================

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
  InterviewTask,
  InterviewTaskRequest,
} from "../../../shared/types/interviews";

import type {
  InterviewServiceContract,
} from "../../../shared/contracts/interview.contract";

import type {
  InterviewTaskResponse,
} from "../../../shared/contracts/interview.contract";

import { InterviewError } from "../errors/InterviewError";

import { InterviewValidator } from "../validation/InterviewValidator";

import { InterviewClassifier } from "../classification/InterviewClassifier";

import { AnswerBuilder } from "../answer/AnswerBuilder";

import type { InterviewTaskEngine } from "../contracts/InterviewTaskEngine";

import { BehavioralEngine } from "../engines/BehavioralEngine";
import { CaseEngine } from "../engines/CaseEngine";
import { CodingEngine } from "../engines/CodingEngine";
import { CommunicationEngine } from "../engines/CommunicationEngine";
import { ExperienceEngine } from "../engines/ExperienceEngine";
import { GeneralEngine } from "../engines/GeneralEngine";
import { MotivationEngine } from "../engines/MotivationEngine";
import { ProductEngine } from "../engines/ProductEngine";
import { SituationalEngine } from "../engines/SituationalEngine";
import { SystemDesignEngine } from "../engines/SystemDesignEngine";
import { TechnicalEngine } from "../engines/TechnicalEngine";

// ============================================================================
// OPTIONS
// ============================================================================

export interface InterviewEngineOptions {
  /**
   * Conversation boundary validator.
   */
  readonly validator?: InterviewValidator;

  /**
   * Interview classification service.
   */
  readonly classifier?: InterviewClassifier;

  /**
   * Deterministic answer-guidance builder.
   */
  readonly answerBuilder?: AnswerBuilder;

  /**
   * Interview-specific task engines.
   *
   * When omitted, the default Veyra interview engines are registered.
   */
  readonly taskEngines?: readonly InterviewTaskEngine[];

  /**
   * Indicates whether verified candidate context is currently available to
   * the AnswerBuilder.
   *
   * This flag does not retrieve candidate data.
   *
   * Candidate retrieval remains the responsibility of InterviewIntelligence
   * and CandidateServiceContract.
   */
  readonly candidateContextAvailable?: boolean;
}

// ============================================================================
// SERVICE
// ============================================================================

export class InterviewEngine
  implements InterviewServiceContract
{
  private readonly validator: InterviewValidator;

  private readonly classifier: InterviewClassifier;

  private readonly answerBuilder: AnswerBuilder;

  private readonly taskEngines: readonly InterviewTaskEngine[];

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

  public constructor(
    options: InterviewEngineOptions = {},
  ) {
    this.validator =
      options.validator ??
      new InterviewValidator();

    this.classifier =
      options.classifier ??
      new InterviewClassifier();

    this.answerBuilder =
      options.answerBuilder ??
      new AnswerBuilder({
        candidateContextAvailable:
          options.candidateContextAvailable ?? false,
      });

    this.taskEngines =
      options.taskEngines ??
      Object.freeze([
        new BehavioralEngine(),
        new CaseEngine(),
        new CodingEngine(),
        new CommunicationEngine(),
        new ExperienceEngine(),
        new GeneralEngine(),
        new MotivationEngine(),
        new ProductEngine(),
        new SituationalEngine(),
        new SystemDesignEngine(),
        new TechnicalEngine(),
      ]);
  }

  // ========================================================================
  // PUBLIC CONTRACT: ANALYZE
  // ========================================================================

  /**
   * Perform complete interview analysis.
   *
   * This is the primary public InterviewEngine operation.
   */
  public async analyze(
    request: InterviewAnalysisRequest,
  ): Promise<{
    readonly analysis: InterviewAnalysis;
  }> {
    const analysis =
      await this.execute(request);

    return {
      analysis,
    };
  }

  // ========================================================================
  // PUBLIC CONTRACT: DETECT TASK
  // ========================================================================

  /**
   * Detect the concrete interview task represented by an already-classified
   * conversation.
   *
   * IMPORTANT:
   *
   * This method does not perform a second classification.
   *
   * The caller supplies the InterviewClassification because task extraction
   * should operate against an already-determined interview type.
   *
   * Flow:
   *
   *     InterviewTaskRequest
   *             ↓
   *     validate conversation
   *             ↓
   *     supplied classification
   *             ↓
   *     find matching task engine
   *             ↓
   *     build InterviewTask
   */
  public async detectTask(
    request: InterviewTaskRequest,
  ): Promise<InterviewTaskResponse> {
    this.validateTaskRequest(request);

    this.throwIfAborted(request.signal);

    try {
      this.validator.validateConversation(
        request.analysis,
      );

      this.throwIfAborted(request.signal);

      const engine =
        this.findEngine(
          request.classification.type,
        );

      if (!engine) {
        return Object.freeze({
          task: undefined,
        });
      }

      const task =
        engine.buildTask(
          request.analysis,
          request.classification,
        );

      this.throwIfAborted(request.signal);

      return Object.freeze({
        task,
      });
    } catch (error) {
      if (error instanceof InterviewError) {
        throw error;
      }

      throw InterviewError.engineFailure(
        "Interview task detection failed.",
        {
          cause: error,
          candidateId:
            request.candidateId,
          sessionId:
            request.analysis.turn.id,
        },
      );
    }
  }

  // ========================================================================
  // INTERNAL COMPLETE EXECUTION
  // ========================================================================

  /**
   * Execute the complete Interview analysis pipeline.
   *
   * This method remains available to higher-level Interview services such as
   * InterviewIntelligence.
   */
  public async execute(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewAnalysis> {
    this.validateRequest(request);

    this.throwIfAborted(
      request.signal,
    );

    try {
      // --------------------------------------------------------------------
      // 1. Validate ConversationAnalysis
      // --------------------------------------------------------------------

      this.validator.validateConversation(
        request.conversation,
      );

      this.throwIfAborted(
        request.signal,
      );

      // --------------------------------------------------------------------
      // 2. Classify Interview Type
      // --------------------------------------------------------------------

      const classification =
        this.classifier.classify(
          request.conversation,
        );

      this.throwIfAborted(
        request.signal,
      );

      // --------------------------------------------------------------------
      // 3. Resolve Task Engine
      // --------------------------------------------------------------------

      const engine =
        this.findEngine(
          classification.type,
        );

      // --------------------------------------------------------------------
      // 4. Build Current Interview Task
      // --------------------------------------------------------------------

      const currentTask =
        engine?.buildTask(
          request.conversation,
          classification,
        );

      this.throwIfAborted(
        request.signal,
      );

      // --------------------------------------------------------------------
      // 5. Build Deterministic Answer Guidance
      // --------------------------------------------------------------------

      const answerGuidance =
        currentTask ||
        request.conversation.question.isQuestion
          ? this.answerBuilder.build(
              request.conversation,
              classification,
            )
          : undefined;

      this.throwIfAborted(
        request.signal,
      );

      // --------------------------------------------------------------------
      // 6. Calculate Overall Confidence
      // --------------------------------------------------------------------

      const confidence =
        this.calculateOverallConfidence(
          request.conversation,
          classification,
          currentTask !== undefined,
        );

      // --------------------------------------------------------------------
      // 7. Build Combined Interview Signals
      // --------------------------------------------------------------------

      const signals =
        this.buildSignals(
          request.conversation,
          classification,
          currentTask !== undefined,
        );

      // --------------------------------------------------------------------
      // 8. Return Immutable Interview Analysis
      // --------------------------------------------------------------------

      return Object.freeze({
        classification,

        currentTask,

        conversation:
          request.conversation,

        confidence,

        signals,

        answerGuidance,

        candidateId:
          request.candidateId,

        contextIds:
          request.candidateId
            ? [
                `candidate:${request.candidateId}`,
              ]
            : undefined,
      });
    } catch (error) {
      if (error instanceof InterviewError) {
        throw error;
      }

      throw InterviewError.engineFailure(
        "Interview analysis failed.",
        {
          cause: error,

          candidateId:
            request.candidateId,

          sessionId:
            request.conversation.turn.id,
        },
      );
    }
  }

  // ========================================================================
  // TASK ENGINE RESOLUTION
  // ========================================================================

  /**
   * Find the task engine responsible for the supplied InterviewType.
   *
   * Task engines remain internal implementation details of InterviewEngine.
   */
  private findEngine(
    type: InterviewAnalysis["classification"]["type"],
  ): InterviewTaskEngine | undefined {
    return this.taskEngines.find(
      (engine) =>
        engine.type === type &&
        engine.canHandle({
          type,
          confidence: 1,
          alternatives: [],
          signals: [],
        }),
    );
  }

  // ========================================================================
  // CONFIDENCE
  // ========================================================================

  /**
   * Calculate the overall confidence of the interview interpretation.
   */
  private calculateOverallConfidence(
    conversation:
      InterviewAnalysisRequest["conversation"],
    classification:
      InterviewAnalysis["classification"],
    hasTask: boolean,
  ): number {
    const values = [
      classification.confidence,
      conversation.question.confidence,
      conversation.intent.confidence,
    ];

    if (hasTask) {
      values.push(0.9);
    }

    const average =
      values.reduce(
        (sum, value) =>
          sum + value,
        0,
      ) / values.length;

    return Math.max(
      0,
      Math.min(1, average),
    );
  }

  // ========================================================================
  // SIGNALS
  // ========================================================================

  /**
   * Combine classifier and conversation signals into the final interview
   * signal collection.
   */
  private buildSignals(
    conversation:
      InterviewAnalysisRequest["conversation"],
    classification:
      InterviewAnalysis["classification"],
    hasTask: boolean,
  ): readonly string[] {
    const signals = [
      ...classification.signals,

      `question:${conversation.question.isQuestion}`,

      `intent:${conversation.intent.intent}`,

      `task:${hasTask}`,
    ];

    if (
      conversation.followUp.isFollowUp
    ) {
      signals.push(
        "conversation:follow-up",
      );
    }

    if (
      conversation.clarification
        .isClarification
    ) {
      signals.push(
        "conversation:clarification",
      );
    }

    if (
      conversation.repetition.isRepeated
    ) {
      signals.push(
        "conversation:repetition",
      );
    }

    return signals;
  }

  // ========================================================================
  // REQUEST VALIDATION
  // ========================================================================

  /**
   * Validate the complete InterviewAnalysis request.
   */
  private validateRequest(
    request: InterviewAnalysisRequest,
  ): void {
    if (!request) {
      throw InterviewError.invalidRequest(
        "Interview analysis request is required.",
      );
    }

    if (!request.conversation) {
      throw InterviewError.invalidRequest(
        "Conversation analysis is required.",
      );
    }

    if (
      request.candidateId !==
        undefined &&
      !request.candidateId.trim()
    ) {
      throw InterviewError.invalidRequest(
        "candidateId cannot be empty when supplied.",
      );
    }
  }

  /**
   * Validate the explicit task-detection request.
   */
  private validateTaskRequest(
    request: InterviewTaskRequest,
  ): void {
    if (!request) {
      throw InterviewError.invalidRequest(
        "Interview task request is required.",
      );
    }

    if (!request.analysis) {
      throw InterviewError.invalidRequest(
        "Conversation analysis is required for task detection.",
      );
    }

    if (!request.classification) {
      throw InterviewError.invalidRequest(
        "Interview classification is required for task detection.",
      );
    }

    if (
      request.candidateId !==
        undefined &&
      !request.candidateId.trim()
    ) {
      throw InterviewError.invalidRequest(
        "candidateId cannot be empty when supplied.",
      );
    }
  }

  // ========================================================================
  // CANCELLATION
  // ========================================================================

  /**
   * Stop processing when the caller has cancelled the operation.
   */
  private throwIfAborted(
    signal?: AbortSignal,
  ): void {
    if (!signal?.aborted) {
      return;
    }

    throw InterviewError.cancelled();
  }
}
