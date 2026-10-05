
// ============================================================================
// FILE: core/interview/services/InterviewIntelligence.ts
//
// PURPOSE:
// Higher-level Interview intelligence orchestration.
//
// CONNECTIONS:
//
//     core/conversation
//            ↓
//     ConversationAnalysis
//            ↓
//     InterviewEngine
//            ↓
//     CandidateServiceContract
//            ↓
//     CandidateSummary
//
//     Interview
//            ↓
//     ContextManager
//            ↓
//     candidate/document/conversation knowledge
//
// IMPORTANT:
//
// Candidate remains the authority over candidate identity and structured
// candidate data.
//
// Context remains the authority over generic searchable knowledge.
//
// Interview only consumes those boundaries.
// ============================================================================

import type { CandidateServiceContract } from "../../../shared/contracts/candidate.contract";

import type { CandidateSummary } from "../../../shared/types/candidate";

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
} from "../../../shared/types/interviews";

import type { ContextManager } from "../../context/ContextManager";

import { InterviewEngine } from "./InterviewEngine";

import { InterviewError } from "../errors/InterviewError";

export interface InterviewIntelligenceOptions {
  readonly interviewEngine?: InterviewEngine;

  readonly candidateService?: CandidateServiceContract;

  readonly contextManager?: ContextManager;
}

export interface InterviewIntelligenceResult {
  readonly analysis: InterviewAnalysis;

  readonly candidate?: CandidateSummary;

  readonly context?: {
    readonly query: string;

    readonly text: string;

    readonly contextIds: readonly string[];
  };
}

export class InterviewIntelligence {
  private readonly interviewEngine: InterviewEngine;

  private readonly candidateService?: CandidateServiceContract;

  private readonly contextManager?: ContextManager;

  public constructor(
    options: InterviewIntelligenceOptions = {},
  ) {
    this.interviewEngine =
      options.interviewEngine ?? new InterviewEngine();

    this.candidateService = options.candidateService;

    this.contextManager = options.contextManager;
  }

  public async analyze(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewIntelligenceResult> {
    if (!request) {
      throw InterviewError.invalidRequest(
        "Interview intelligence request is required.",
      );
    }

    this.throwIfAborted(request.signal);

    const analysis = await this.interviewEngine.execute(request);

    this.throwIfAborted(request.signal);

    let candidate: CandidateSummary | undefined;

    if (
      request.candidateId &&
      this.candidateService
    ) {
      try {
        const result =
          await this.candidateService.getSummary({
            candidateId: request.candidateId,
            signal: request.signal,
          });

        candidate = result.candidate;
      } catch (error) {
        throw InterviewError.candidateFailure(
          "Unable to retrieve candidate information for interview analysis.",
          {
            candidateId: request.candidateId,
            cause: error,
          },
        );
      }
    }

    this.throwIfAborted(request.signal);

    let context:
      | InterviewIntelligenceResult["context"]
      | undefined;

    if (this.contextManager) {
      context = await this.retrieveInterviewContext(
        request,
        analysis,
      );
    }

    return Object.freeze({
      analysis,

      candidate,

      context,
    });
  }

  private async retrieveInterviewContext(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
  ): Promise<InterviewIntelligenceResult["context"]> {
    if (!this.contextManager) {
      return undefined;
    }

    const query = this.buildContextQuery(
      request,
      analysis,
    );

    if (!query) {
      return undefined;
    }

    try {
      const result = await this.contextManager.query({
        query,

        limit: 8,

        minScore: 0.35,

        sourceIds: request.candidateId
          ? [`${request.candidateId}`]
          : undefined,

        signal: request.signal,
      });

      const contextIds = result.contexts
        .map((item) => item.id)
        .filter(Boolean);

      return {
        query,

        text: result.compressed.text,

        contextIds,
      };
    } catch (error) {
      throw InterviewError.contextFailure(
        "Unable to retrieve interview context.",
        {
          candidateId: request.candidateId,
          cause: error,
        },
      );
    }
  }

  private buildContextQuery(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
  ): string | undefined {
    const question = analysis.currentTask?.questionText ??
      analysis.conversation.turn.text;

    if (!question.trim()) {
      return undefined;
    }

    if (request.candidateId) {
      return [
        `Interview question: ${question}`,
        `Candidate ID: ${request.candidateId}`,
        "Find relevant verified candidate experience, projects, skills, education, stories, and evidence.",
      ].join("\n");
    }

    return [
      `Interview question: ${question}`,
      "Find relevant interview context and supporting knowledge.",
    ].join("\n");
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw InterviewError.cancelled();
  }
}
