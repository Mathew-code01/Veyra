// ============================================================================
// FILE: core/interview/services/InterviewIntelligence.ts
//
// PURPOSE:
// Higher-level Interview orchestration.
//
// ARCHITECTURE:
//
//     ConversationAnalysis
//             │
//             ▼
//     InterviewEngine
//             │
//             ├── InterviewClassification
//             ├── InterviewTask
//             └── AnswerGuidance
//                     │
//                     ▼
//             InterviewIntelligence
//               │           │
//               ▼           ▼
//        CandidateService  ContextManager
//               │           │
//               └─────┬─────┘
//                     ▼
//               PromptService
//                     │
//                     ▼
//                 AIRequest
//
// IMPORTANT:
//
// InterviewIntelligence is the connection point between:
// - Interview
// - Candidate
// - Context
// - Prompts
//
// It does NOT execute AI itself.
//
// The caller may take the resulting AIRequest and pass it to core/ai.
// ============================================================================

import type { CandidateServiceContract } from "../../../shared/contracts/candidate.contract";

import type { CandidateSummary } from "../../../shared/types/candidate";

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
} from "../../../shared/types/interviews";

import type { AIRequest } from "../../../shared/types/ai";

import type { ContextManager } from "../../context/ContextManager";

import { PromptService } from "../../prompts/services/PromptService";

import type {
  PromptCandidateEvidence,
  PromptContextEvidence,
  PromptInstructionSet,
  PromptResponseStyle,
} from "../../prompts/contracts/PromptTypes";

import { InterviewEngine } from "./InterviewEngine";

import { InterviewError } from "../errors/InterviewError";

// ============================================================================
// OPTIONS
// ============================================================================

export interface InterviewIntelligenceOptions {
  readonly interviewEngine?: InterviewEngine;

  readonly candidateService?: CandidateServiceContract;

  readonly contextManager?: ContextManager;

  readonly promptService?: PromptService;
}

// ============================================================================
// RESULT
// ============================================================================

export interface InterviewIntelligenceResult {
  /**
   * Deterministic Interview understanding.
   */
  readonly analysis: InterviewAnalysis;

  /**
   * Verified candidate information, when available.
   */
  readonly candidate?: CandidateSummary;

  /**
   * Retrieved context, when available.
   */
  readonly context?: {
    readonly query: string;

    readonly text: string;

    readonly contextIds: readonly string[];
  };

  /**
   * Final prompt instructions.
   */
  readonly prompt?: PromptInstructionSet;

  /**
   * AI-ready request.
   *
   * This is still NOT executed here.
   */
  readonly aiRequest?: AIRequest;
}

// ============================================================================
// REQUEST
// ============================================================================

export interface InterviewIntelligencePromptOptions {
  readonly requestId: AIRequest["requestId"];

  readonly provider?: AIRequest["provider"];

  readonly model?: string;

  readonly stream?: boolean;

  readonly timeoutMs?: number;

  readonly responseStyle?: PromptResponseStyle;
}

// ============================================================================
// SERVICE
// ============================================================================

export class InterviewIntelligence {
  private readonly interviewEngine: InterviewEngine;

  private readonly candidateService?: CandidateServiceContract;

  private readonly contextManager?: ContextManager;

  private readonly promptService: PromptService;

  public constructor(options: InterviewIntelligenceOptions = {}) {
    this.interviewEngine = options.interviewEngine ?? new InterviewEngine();

    this.candidateService = options.candidateService;

    this.contextManager = options.contextManager;

    this.promptService = options.promptService ?? new PromptService();
  }

  // ========================================================================
  // ANALYZE
  // ========================================================================

  /**
   * Analyze an interview and enrich it with candidate/context information.
   *
   * This method stops before AI execution.
   */
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

    // ======================================================================
    // CANDIDATE
    // ======================================================================

    if (request.candidateId && this.candidateService) {
      try {
        const result = await this.candidateService.getSummary({
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

    // ======================================================================
    // CONTEXT
    // ======================================================================

    let context: InterviewIntelligenceResult["context"] | undefined;

    if (this.contextManager) {
      context = await this.retrieveInterviewContext(request, analysis);
    }

    this.throwIfAborted(request.signal);

    // ======================================================================
    // PROMPT
    // ======================================================================

    const promptInput = this.buildPromptInput(
      request,
      analysis,
      candidate,
      context,
    );

    const prompt = this.promptService.buildInterview(promptInput);

    return Object.freeze({
      analysis,
      candidate,
      context,
      prompt,
    });
  }

  // ========================================================================
  // ANALYZE + BUILD AI REQUEST
  // ========================================================================

  /**
   * Full orchestration path:
   *
   *     conversation
   *          ↓
   *     interview analysis
   *          ↓
   *     candidate/context
   *          ↓
   *     prompt
   *          ↓
   *     AIRequest
   *
   * The AIRequest is returned but NOT executed.
   */
  public async analyzeForAI(
    request: InterviewAnalysisRequest,
    options: InterviewIntelligencePromptOptions,
  ): Promise<InterviewIntelligenceResult> {
    if (!options) {
      throw InterviewError.invalidRequest(
        "Interview AI prompt options are required.",
      );
    }

    if (!options.requestId) {
      throw InterviewError.invalidRequest(
        "A requestId is required for AI request construction.",
      );
    }

    const result = await this.analyze(request);

    this.throwIfAborted(request.signal);

    if (!result.prompt) {
      throw InterviewError.engineFailure(
        "Interview prompt construction did not produce a prompt.",
      );
    }

    const aiRequest = this.promptService.toAIRequest(result.prompt, {
      requestId: options.requestId,

      provider: options.provider,

      model: options.model,

      stream: options.stream,

      timeoutMs: options.timeoutMs,

      signal: request.signal,

      metadata: Object.freeze({
        feature: "interview",
        interviewType: result.analysis.classification.type,
      }),
    });

    return Object.freeze({
      ...result,
      aiRequest,
    });
  }

  // ========================================================================
  // CONTEXT
  // ========================================================================

  private async retrieveInterviewContext(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
  ): Promise<InterviewIntelligenceResult["context"]> {
    if (!this.contextManager) {
      return undefined;
    }

    const query = this.buildContextQuery(request, analysis);

    if (!query) {
      return undefined;
    }

    try {
      const result = await this.contextManager.query({
        query,

        limit: 8,

        minScore: 0.35,

        sourceIds: request.candidateId ? [request.candidateId] : undefined,

        signal: request.signal,
      });

      const contextIds = result.contexts.map((item) => item.id).filter(Boolean);

      return Object.freeze({
        query,

        text: result.compressed.text,

        contextIds: Object.freeze(contextIds),
      });
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

  // ========================================================================
  // PROMPT INPUT
  // ========================================================================

  private buildPromptInput(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
    candidate?: CandidateSummary,
    context?: InterviewIntelligenceResult["context"],
  ) {
    const candidateEvidence = this.toPromptCandidateEvidence(
      request,
      candidate,
    );

    const contextEvidence = this.toPromptContextEvidence(context);

    return Object.freeze({
      analysis,

      candidate: candidateEvidence,

      context: contextEvidence,

      question:
        analysis.currentTask?.questionText ?? analysis.conversation.turn.text,

      responseStyle: "interview-ready" as const,

      signal: request.signal,
    });
  }

  // ========================================================================
  // CANDIDATE ADAPTER
  // ========================================================================

  /**
   * Converts the candidate subsystem's public summary into the prompt
   * subsystem's intentionally smaller evidence contract.
   *
   * The Prompt layer therefore does not depend on CandidateService internals.
   */
  private toPromptCandidateEvidence(
    request: InterviewAnalysisRequest,
    candidate?: CandidateSummary,
  ): PromptCandidateEvidence | undefined {
    if (!candidate) {
      return request.candidateId
        ? Object.freeze({
            candidateId: request.candidateId,
          })
        : undefined;
    }

    const candidateRecord = candidate as unknown as Record<string, unknown>;

    const summary =
      typeof candidateRecord.summary === "string"
        ? candidateRecord.summary
        : undefined;

    const facts = this.extractStringArray(candidateRecord.facts);

    const relevantEvidence = this.extractStringArray(
      candidateRecord.experience,
    );

    return Object.freeze({
      candidateId: request.candidateId,

      summary,

      facts: facts.length > 0 ? Object.freeze(facts) : undefined,

      relevantEvidence:
        relevantEvidence.length > 0
          ? Object.freeze(relevantEvidence)
          : undefined,
    });
  }

  // ========================================================================
  // CONTEXT ADAPTER
  // ========================================================================

  private toPromptContextEvidence(
    context?: InterviewIntelligenceResult["context"],
  ): PromptContextEvidence | undefined {
    if (!context) {
      return undefined;
    }

    return Object.freeze({
      text: context.text,

      contextIds: context.contextIds,
    });
  }

  // ========================================================================
  // CONTEXT QUERY
  // ========================================================================

  private buildContextQuery(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
  ): string | undefined {
    const question =
      analysis.currentTask?.questionText ?? analysis.conversation.turn.text;

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

  // ========================================================================
  // HELPERS
  // ========================================================================

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw InterviewError.cancelled();
  }
}
