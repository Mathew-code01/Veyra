// ============================================================================
// FILE: core/interview/services/InterviewIntelligence.ts
//
// PURPOSE:
// Higher-level Interview orchestration boundary.
//
// ARCHITECTURE:
//
//     ConversationAnalysis
//             │
//             ▼
//       InterviewEngine
//             │
//             ▼
//      InterviewAnalysis
//             │
//        ┌────┴────┐
//        ▼         ▼
// CandidateService ContextManager
//        │         │
//        └────┬────┘
//             ▼
//       InterviewIntelligence
//             │
//             ▼
//        PromptService
//             │
//             ▼
//      PromptInstructionSet
//             │
//             ▼
//       AIRequest
//             │
//             ▼
//          core/ai
//
// IMPORTANT:
//
// InterviewIntelligence is the orchestration boundary between:
//
//     Interview
//     Candidate
//     Context
//     Prompts
//
// It DOES NOT:
//
// - execute AI
// - select providers
// - route models
// - implement retries
// - implement cloud transport
// - implement local runtimes
//
// core/ai owns AI execution.
//
// The resulting AIResponse is expected to travel back to the higher-level
// caller, which may then associate it with this InterviewIntelligence result.
//
// COMPLETE FLOW:
//
//     ConversationAnalysis
//             ↓
//     InterviewEngine
//             ↓
//     InterviewAnalysis
//             ↓
//     CandidateService
//             ↓
//     ContextManager
//             ↓
//     PromptService
//             ↓
//     PromptInstructionSet
//             ↓
//     AIRequest
//             ↓
//     core/ai
//             ↓
//     AIResponse
//             ↓
//     Interview application / copilot / UI
// ============================================================================

import type { CandidateServiceContract } from "../../../shared/contracts/candidate.contract";

import type { CandidateSummary } from "../../../shared/types/candidate";

import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
} from "../../../shared/types/interviews";

import type { AIRequest, AIResponse } from "../../../shared/types/ai";

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
  /**
   * Deterministic Interview domain engine.
   *
   * This determines what is happening in the interview.
   */
  readonly interviewEngine?: InterviewEngine;

  /**
   * Candidate subsystem.
   *
   * Provides verified candidate information.
   */
  readonly candidateService?: CandidateServiceContract;

  /**
   * Generic Veyra context subsystem.
   *
   * Provides supporting contextual evidence.
   */
  readonly contextManager?: ContextManager;

  /**
   * Prompt subsystem.
   *
   * Converts already-resolved Interview/Candidate/Context information into
   * deterministic AI instructions.
   */
  readonly promptService?: PromptService;
}

// ============================================================================
// CONTEXT RESULT
// ============================================================================

export interface InterviewIntelligenceContext {
  /**
   * Query sent to ContextManager.
   */
  readonly query: string;

  /**
   * Compressed context returned by ContextManager.
   */
  readonly text: string;

  /**
   * IDs of the context records used.
   */
  readonly contextIds: readonly string[];
}

// ============================================================================
// RESULT
// ============================================================================

export interface InterviewIntelligenceResult {
  /**
   * Deterministic understanding of the interview.
   *
   * Produced by InterviewEngine.
   */
  readonly analysis: InterviewAnalysis;

  /**
   * Verified candidate information.
   *
   * Produced by CandidateService.
   */
  readonly candidate?: CandidateSummary;

  /**
   * Retrieved supporting context.
   *
   * Produced by ContextManager.
   */
  readonly context?: InterviewIntelligenceContext;

  /**
   * Final prompt instructions.
   *
   * Produced by PromptService.
   *
   * This is the direct result of prompt construction.
   */
  readonly prompt?: PromptInstructionSet;

  /**
   * Canonical AI request.
   *
   * Produced by PromptService from the PromptInstructionSet.
   *
   * This is NOT executed here.
   *
   * The caller passes this request to core/ai.
   */
  readonly aiRequest?: AIRequest;
}

// ============================================================================
// PROMPT OPTIONS
// ============================================================================

export interface InterviewIntelligencePromptOptions {
  /**
   * Stable request identifier required by shared AIRequest.
   */
  readonly requestId: AIRequest["requestId"];

  /**
   * Optional explicit provider.
   *
   * If omitted, the AI routing/execution layer may choose one.
   */
  readonly provider?: AIRequest["provider"];

  /**
   * Optional explicit model.
   */
  readonly model?: string;

  /**
   * Whether AI execution should stream.
   */
  readonly stream?: boolean;

  /**
   * Optional timeout.
   */
  readonly timeoutMs?: number;

  /**
   * Prompt response style.
   *
   * This affects PromptInstructionSet generation settings.
   */
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

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

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
   * Perform complete Interview intelligence preparation.
   *
   * Flow:
   *
   *     ConversationAnalysis
   *             ↓
   *     InterviewEngine
   *             ↓
   *     InterviewAnalysis
   *             ↓
   *     CandidateService
   *             +
   *     ContextManager
   *             ↓
   *     PromptService
   *             ↓
   *     PromptInstructionSet
   *
   * This method does NOT construct an AIRequest because request metadata such
   * as requestId/provider/model belongs to the AI-request stage.
   *
   * Use analyzeForAI() when the caller needs the canonical AIRequest.
   */
  public async analyze(
    request: InterviewAnalysisRequest,
  ): Promise<InterviewIntelligenceResult> {
    this.validateAnalysisRequest(request);

    this.throwIfAborted(request.signal);

    // ======================================================================
    // 1. INTERVIEW ANALYSIS
    // ======================================================================

    const analysis = await this.interviewEngine.execute(request);

    this.throwIfAborted(request.signal);

    // ======================================================================
    // 2. CANDIDATE
    // ======================================================================

    const candidate = await this.retrieveCandidate(request);

    this.throwIfAborted(request.signal);

    // ======================================================================
    // 3. CONTEXT
    // ======================================================================

    const context = await this.retrieveInterviewContext(request, analysis);

    this.throwIfAborted(request.signal);

    // ======================================================================
    // 4. PROMPT
    // ======================================================================

    /**
     * This is the important connection:
     *
     * InterviewIntelligence now has:
     *
     *     InterviewAnalysis
     *     Candidate evidence
     *     Context evidence
     *
     * Those are passed into PromptService.
     *
     * PromptService returns:
     *
     *     PromptInstructionSet
     *
     * The PromptInstructionSet becomes part of the InterviewIntelligence
     * result.
     */
    const promptInput = this.buildPromptInput(
      request,
      analysis,
      candidate,
      context,
    );

    const prompt = this.promptService.buildInterview(promptInput);

    this.throwIfAborted(request.signal);

    // ======================================================================
    // 5. RETURN INTELLIGENCE RESULT
    // ======================================================================

    return Object.freeze({
      analysis,

      candidate,

      context,

      prompt,
    });
  }

  // ========================================================================
  // ANALYZE FOR AI
  // ========================================================================

  /**
   * Prepare a complete interview AI request.
   *
   * Flow:
   *
   *     ConversationAnalysis
   *             ↓
   *     InterviewEngine
   *             ↓
   *     CandidateService
   *             +
   *     ContextManager
   *             ↓
   *     PromptService
   *             ↓
   *     PromptInstructionSet
   *             ↓
   *     PromptService.toAIRequest()
   *             ↓
   *          AIRequest
   *
   * IMPORTANT:
   *
   * The AIRequest is returned.
   *
   * It is NOT executed here.
   */
  public async analyzeForAI(
    request: InterviewAnalysisRequest,
    options: InterviewIntelligencePromptOptions,
  ): Promise<InterviewIntelligenceResult> {
    this.validatePromptOptions(options);

    this.throwIfAborted(request.signal);

    const result = await this.analyzeWithResponseStyle(
      request,
      options.responseStyle,
    );

    this.throwIfAborted(request.signal);

    if (!result.prompt) {
      throw InterviewError.engineFailure(
        "Interview prompt construction did not produce a prompt.",
      );
    }

    // ======================================================================
    // PROMPT → AI REQUEST
    // ======================================================================

    /**
     * This is the second important connection:
     *
     *     PromptInstructionSet
     *              ↓
     *     PromptService.toAIRequest()
     *              ↓
     *          AIRequest
     *
     * PromptService remains responsible for translating prompt instructions
     * into the canonical shared AIRequest contract.
     */
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

        interviewConfidence: String(result.analysis.confidence),
      }),
    });

    this.throwIfAborted(request.signal);

    return Object.freeze({
      ...result,

      aiRequest,
    });
  }

  // ========================================================================
  // ANALYZE WITH RESPONSE STYLE
  // ========================================================================

  /**
   * Internal preparation helper.
   *
   * This allows analyzeForAI() to pass the requested response style into the
   * Prompt subsystem without making response style part of InterviewEngine.
   */
  private async analyzeWithResponseStyle(
    request: InterviewAnalysisRequest,
    responseStyle?: PromptResponseStyle,
  ): Promise<InterviewIntelligenceResult> {
    this.validateAnalysisRequest(request);

    this.throwIfAborted(request.signal);

    const analysis = await this.interviewEngine.execute(request);

    this.throwIfAborted(request.signal);

    const candidate = await this.retrieveCandidate(request);

    this.throwIfAborted(request.signal);

    const context = await this.retrieveInterviewContext(request, analysis);

    this.throwIfAborted(request.signal);

    const promptInput = this.buildPromptInput(
      request,
      analysis,
      candidate,
      context,
      responseStyle,
    );

    const prompt = this.promptService.buildInterview(promptInput);

    this.throwIfAborted(request.signal);

    return Object.freeze({
      analysis,

      candidate,

      context,

      prompt,
    });
  }

  // ========================================================================
  // CANDIDATE
  // ========================================================================

  /**
   * Retrieve verified candidate information.
   *
   * InterviewIntelligence owns the orchestration.
   *
   * PromptService never calls CandidateService directly.
   */
  private async retrieveCandidate(
    request: InterviewAnalysisRequest,
  ): Promise<CandidateSummary | undefined> {
    if (!request.candidateId || !this.candidateService) {
      return undefined;
    }

    try {
      const result = await this.candidateService.getSummary({
        candidateId: request.candidateId,

        signal: request.signal,
      });

      return result.candidate;
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

  // ========================================================================
  // CONTEXT
  // ========================================================================

  /**
   * Retrieve context relevant to the current interview task.
   *
   * Context retrieval happens BEFORE prompt construction.
   *
   * This is intentional:
   *
   *     ContextManager
   *          ↓
   *     resolved evidence
   *          ↓
   *     PromptService
   *
   * PromptService never decides what context to retrieve.
   */
  private async retrieveInterviewContext(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
  ): Promise<InterviewIntelligenceContext | undefined> {
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

      const contextIds = result.contexts
        .map((item) => item.id)
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        );

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

  /**
   * Adapt InterviewIntelligence data into the Prompt subsystem contract.
   *
   * This is the boundary adapter.
   *
   * PromptService does not receive:
   *
   *     CandidateSummary
   *     ContextManager
   *     InterviewEngine
   *
   * It receives intentionally smaller prompt evidence contracts.
   */
  private buildPromptInput(
    request: InterviewAnalysisRequest,
    analysis: InterviewAnalysis,
    candidate?: CandidateSummary,
    context?: InterviewIntelligenceContext,
    responseStyle?: PromptResponseStyle,
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

      responseStyle: responseStyle ?? "interview-ready",

      signal: request.signal,
    });
  }

  // ========================================================================
  // CANDIDATE → PROMPT ADAPTER
  // ========================================================================

  /**
   * Convert CandidateSummary into the intentionally smaller
   * PromptCandidateEvidence contract.
   *
   * PromptService therefore remains independent from CandidateService's
   * internal model.
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
  // CONTEXT → PROMPT ADAPTER
  // ========================================================================

  private toPromptContextEvidence(
    context?: InterviewIntelligenceContext,
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

  /**
   * Build the retrieval query from already-understood interview information.
   *
   * InterviewEngine determines what is happening.
   *
   * InterviewIntelligence determines what supporting information should be
   * requested from the generic Context subsystem.
   */
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
  // AI RESPONSE ATTACHMENT
  // ========================================================================

  /**
   * Attach an already-executed AIResponse to an InterviewIntelligence result.
   *
   * IMPORTANT:
   *
   * This method does NOT execute AI.
   *
   * The caller remains responsible for:
   *
   *     aiRequest
   *         ↓
   *     core/ai
   *         ↓
   *     AIResponse
   *
   * Once the caller has the AIResponse, it may associate that response with
   * the InterviewIntelligence result.
   *
   * This method is intentionally generic because interpretation of the final
   * response may later belong to a dedicated InterviewAnswerService or
   * InterviewResponseInterpreter.
   */
  public attachAIResponse(
    result: InterviewIntelligenceResult,
    response: AIResponse,
  ): InterviewIntelligenceAIResult {
    if (!result) {
      throw InterviewError.invalidRequest(
        "Interview intelligence result is required.",
      );
    }

    if (!response) {
      throw InterviewError.invalidRequest("AI response is required.");
    }

    return Object.freeze({
      ...result,

      response,
    });
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

  // ========================================================================
  // VALIDATION
  // ========================================================================

  private validateAnalysisRequest(request: InterviewAnalysisRequest): void {
    if (!request) {
      throw InterviewError.invalidRequest(
        "Interview intelligence request is required.",
      );
    }

    if (!request.conversation) {
      throw InterviewError.invalidRequest("Conversation analysis is required.");
    }

    if (request.candidateId !== undefined && !request.candidateId.trim()) {
      throw InterviewError.invalidRequest(
        "candidateId cannot be empty when supplied.",
      );
    }
  }

  private validatePromptOptions(
    options: InterviewIntelligencePromptOptions,
  ): void {
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
  }

  // ========================================================================
  // CANCELLATION
  // ========================================================================

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw InterviewError.cancelled();
  }
}

// ============================================================================
// AI RESULT
// ============================================================================

/**
 * InterviewIntelligence result after an already-executed AI request has been
 * associated with it.
 *
 * The execution itself still belongs to core/ai.
 */
export interface InterviewIntelligenceAIResult extends InterviewIntelligenceResult {
  readonly response: AIResponse;
}
