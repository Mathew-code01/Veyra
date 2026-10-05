
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
// This service does not own conversation state.
// ============================================================================

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
} from "../../../shared/types/interviews";

import type { InterviewServiceContract } from "../../../shared/contracts/interview.contract";

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

export interface InterviewEngineOptions {
  readonly validator?: InterviewValidator;

  readonly classifier?: InterviewClassifier;

  readonly answerBuilder?: AnswerBuilder;

  readonly taskEngines?: readonly InterviewTaskEngine[];

  readonly candidateContextAvailable?: boolean;
}

export class InterviewEngine implements InterviewServiceContract {
  private readonly validator: InterviewValidator;

  private readonly classifier: InterviewClassifier;

  private readonly answerBuilder: AnswerBuilder;

  private readonly taskEngines: readonly InterviewTaskEngine[];

  private readonly candidateContextAvailable: boolean;

  public constructor(options: InterviewEngineOptions = {}) {
    this.validator =
      options.validator ?? new InterviewValidator();

    this.classifier =
      options.classifier ?? new InterviewClassifier();

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

    this.candidateContextAvailable =
      options.candidateContextAvailable ?? false;
  }

  public async analyze(
    request: InterviewAnalysisRequest,
  ): Promise<{ readonly analysis: InterviewAnalysis }> {
    const analysis = await this.execute(request);

    return {
      analysis,
    };
  }

  public async execute(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewAnalysis> {
    this.validateRequest(request);

    this.throwIfAborted(request.signal);

    try {
      this.validator.validateConversation(request.conversation);

      this.throwIfAborted(request.signal);

      const classification = this.classifier.classify(
        request.conversation,
      );

      this.throwIfAborted(request.signal);

      const engine = this.findEngine(classification.type);

      const currentTask = engine?.buildTask(
        request.conversation,
        classification,
      );

      this.throwIfAborted(request.signal);

      const answerGuidance =
        currentTask || request.conversation.question.isQuestion
          ? this.answerBuilder.build(
              request.conversation,
              classification,
            )
          : undefined;

      const confidence = this.calculateOverallConfidence(
        request.conversation,
        classification,
        currentTask !== undefined,
      );

      const signals = this.buildSignals(
        request.conversation,
        classification,
        currentTask !== undefined,
      );

      return Object.freeze({
        classification,

        currentTask,

        conversation: request.conversation,

        confidence,

        signals,

        answerGuidance,

        candidateId: request.candidateId,

        contextIds: request.candidateId
          ? [`candidate:${request.candidateId}`]
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

          candidateId: request.candidateId,

          sessionId: request.conversation.turn.id,
        },
      );
    }
  }

  private findEngine(
    type: InterviewAnalysis["classification"]["type"],
  ): InterviewTaskEngine | undefined {
    return this.taskEngines.find((engine) =>
      engine.type === type &&
      engine.canHandle({
        type,
        confidence: 1,
        alternatives: [],
        signals: [],
      }),
    );
  }

  private calculateOverallConfidence(
    conversation: InterviewAnalysisRequest["conversation"],
    classification: InterviewAnalysis["classification"],
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
      values.reduce((sum, value) => sum + value, 0) /
      values.length;

    return Math.max(0, Math.min(1, average));
  }

  private buildSignals(
    conversation: InterviewAnalysisRequest["conversation"],
    classification: InterviewAnalysis["classification"],
    hasTask: boolean,
  ): readonly string[] {
    const signals = [
      ...classification.signals,
      `question:${conversation.question.isQuestion}`,
      `intent:${conversation.intent.intent}`,
      `task:${hasTask}`,
    ];

    if (conversation.followUp.isFollowUp) {
      signals.push("conversation:follow-up");
    }

    if (conversation.clarification.isClarification) {
      signals.push("conversation:clarification");
    }

    if (conversation.repetition.isRepeated) {
      signals.push("conversation:repetition");
    }

    return signals;
  }

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
      request.candidateId !== undefined &&
      !request.candidateId.trim()
    ) {
      throw InterviewError.invalidRequest(
        "candidateId cannot be empty when supplied.",
      );
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw InterviewError.cancelled();
  }
}
