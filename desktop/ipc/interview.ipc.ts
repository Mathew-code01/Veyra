// Relative path: desktop/ipc/interview.ipc.ts

/**
 * Veyra Interview IPC
 *
 * Location:
 * desktop/ipc/interview.ipc.ts
 *
 * MAIN PROCESS ONLY.
 *
 * The renderer never receives InterviewEngine, InterviewIntelligence,
 * CandidateService, ContextManager, PromptService, or AIManager instances.
 *
 * Supported renderer operations:
 *
 *   1. interview:analyze    - Deterministic interview analysis (classification
 *                             + task + candidate/context enrichment).
 *   2. interview:task       - Interview task detection from conversation state.
 *   3. interview:classify   - Interview classification (mapped to task detection).
 *   4. interview:guidance   - Complete orchestration: analysis + candidate +
 *                             context + prompt construction + AI execution,
 *                             returning an executed interview response.
 *
 * Security:
 * - IPC handlers validate their sender state.
 * - Request payloads are treated as untrusted input.
 * - The runtime `AbortSignal` is stripped before crossing the IPC boundary.
 * - No core service instances are exposed to the renderer.
 *
 * `ipcMain` is injected so this module can be unit-tested without loading
 * the Electron binary.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import type { InterviewIntelligence } from "../../core/interview/services/InterviewIntelligence";

import type {
  InterviewIntelligencePromptOptions,
  InterviewIntelligenceResult,
} from "../../core/interview/services/InterviewIntelligence";

import type { AIManager } from "../../core/ai/AIManager";

import type { AIRequest, AIResponse } from "../../shared/types/ai";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type {
  InterviewAnalysisRequest,
  InterviewTaskRequest,
  InterviewDomain,
  QuestionUnderstanding,
  ResponseMode,
} from "../../shared/types/interviews";

import type {
  InterviewAnalysisResult,
  InterviewTaskResult,
  InterviewExecuteAIResult,
  InterviewExecuteAIResponse,
  InterviewAIRequestOptions,
  InterviewDomainClassifyResult,
  InterviewQuestionUnderstandResult,
  InterviewPlanAnswerResult,
  InterviewEvaluateAnswerResult,
  InterviewCommunicationFeedbackResult,
  InterviewFollowUpResult,
} from "../../shared/contracts/interview.contract";

export interface RegisterInterviewIpcOptions {
  readonly interviewIntelligence: InterviewIntelligence;

  readonly aiManager: AIManager;

  /**
   * Electron ipcMain instance. Injected so tests can supply a mock.
   */
  readonly ipcMain: IpcMain;
}

/**
 * Request for interview guidance through the full orchestration path.
 *
 * Combines the analysis input with AI request options. The runtime signal is
 * intentionally omitted because it cannot cross the IPC boundary.
 */
export interface InterviewGuidanceRequest
  extends Omit<InterviewAnalysisRequest, "signal">,
    InterviewAIRequestOptions {}

/**
 * Safely converts unknown IPC input into an object.
 *
 * IPC arguments originate from the renderer and must always be considered
 * untrusted.
 */
function assertRequestObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Validates the IPC sender before processing a request.
 */
function assertValidIpcSender(
  event: IpcMainInvokeEvent,
): void {
  if (event.sender.isDestroyed()) {
    throw new Error(
      "Veyra IPC request rejected: sender is no longer available.",
    );
  }
}

/**
 * Strips the runtime-only cancellation signal so the AI request can cross
 * the IPC boundary.
 */
function stripSignalFromAiRequest(
  request: AIRequest,
): Omit<AIRequest, "signal"> {
  const { signal: _signal, ...rest } = request;

  return rest;
}

/**
 * Normalizes an analysis request received across IPC, ensuring the runtime
 * signal is not propagated.
 */
function toAnalysisRequest(
  request: Omit<InterviewAnalysisRequest, "signal">,
): InterviewAnalysisRequest {
  return Object.freeze({
    conversation: request.conversation,
    candidateId: request.candidateId,
    signal: undefined,
  });
}

/**
 * Normalizes a task-detection request received across IPC.
 */
function toTaskRequest(
  request: Omit<InterviewTaskRequest, "signal">,
): InterviewTaskRequest {
  return Object.freeze({
    analysis: request.analysis,
    classification: request.classification,
    candidateId: request.candidateId,
    signal: undefined,
  });
}

/**
 * Registers Interview IPC handlers.
 *
 * Returns a cleanup function for tests and controlled application lifecycle
 * management.
 */
export function registerInterviewIpc(
  options: RegisterInterviewIpcOptions,
): () => void {
  const interviewIntelligence = options.interviewIntelligence;

  const aiManager = options.aiManager;

  const ipcMain = options.ipcMain;

  /**
   * INTERVIEW_ANALYZE
   *
   * Runs deterministic interview analysis and returns the InterviewAnalysis
   * with optional candidate/context enrichment.
   */
  const analyzeHandler = async (
    event: IpcMainInvokeEvent,
    request?: Omit<InterviewAnalysisRequest, "signal">,
  ): Promise<InterviewAnalysisResult> => {
    assertValidIpcSender(event);

    if (!request) {
      return {
        success: false,
        error: new Error("Interview analysis request is required."),
      };
    }

    try {
      const result =
        await interviewIntelligence.analyze(toAnalysisRequest(request));

      return {
        success: true,
        data: Object.freeze({
          analysis: result.analysis,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Interview analysis failed."),
      };
    }
  };

  /**
   * INTERVIEW_TASK / INTERVIEW_CLASSIFY
   *
   * Detects the concrete interview task represented by the conversation.
   * Task detection includes classification, so both channels share this
   * handler.
   */
  const taskHandler = async (
    event: IpcMainInvokeEvent,
    request?: Omit<InterviewTaskRequest, "signal">,
  ): Promise<InterviewTaskResult> => {
    assertValidIpcSender(event);

    if (!request) {
      return {
        success: false,
        error: new Error("Interview task request is required."),
      };
    }

    try {
      const result =
        await interviewIntelligence.detectTask(toTaskRequest(request));

      return {
        success: true,
        data: Object.freeze({
          task: result.task,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Interview task detection failed."),
      };
    }
  };

  /**
   * INTERVIEW_GUIDANCE
   *
   * Executes the complete interview orchestration path:
   *
   *     analysis → candidate → context → prompt → AIRequest → AI execution
   *
   * Returns the executed AI response alongside the prepared intelligence.
   */
  const guidanceHandler = async (
    event: IpcMainInvokeEvent,
    request?: InterviewGuidanceRequest,
  ): Promise<InterviewExecuteAIResult> => {
    assertValidIpcSender(event);

    if (!request) {
      return {
        success: false,
        error: new Error("Interview guidance request is required."),
      };
    }

    if (!request.requestId || !request.requestId.trim()) {
      return {
        success: false,
        error: new Error("A requestId is required for interview guidance."),
      };
    }

    let intelligenceResult: InterviewIntelligenceResult;

    try {
      intelligenceResult =
        await interviewIntelligence.analyzeForAI(
          toAnalysisRequest(request),
          {
            requestId: request.requestId,
            provider: request.provider,
            model: request.model,
            stream: request.stream,
            timeoutMs: request.timeoutMs,
            responseStyle: request.responseStyle,
          } as InterviewIntelligencePromptOptions,
        );
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Interview analysis failed."),
      };
    }

    let response: AIResponse | undefined;

    if (intelligenceResult.aiRequest) {
      const providerName =
        intelligenceResult.aiRequest.provider &&
        intelligenceResult.aiRequest.provider.trim().length > 0
          ? intelligenceResult.aiRequest.provider
          : "local";

      try {
        response =
          await aiManager.generate(
            providerName,
            intelligenceResult.aiRequest as Parameters<
              AIManager["generate"]
            >[1],
          );
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error
              : new Error("Interview AI generation failed."),
        };
      }
    }

    return {
      success: true,
      data: Object.freeze({
        analysis: intelligenceResult.analysis,
        aiRequest: intelligenceResult.aiRequest
          ? stripSignalFromAiRequest(intelligenceResult.aiRequest)
          : undefined,
        candidateId:
          intelligenceResult.analysis.candidateId ??
          request.candidateId ??
          undefined,
        contextText: intelligenceResult.context?.text,
        response,
      } as InterviewExecuteAIResponse),
    };
  };

  const domainClassifyHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<InterviewDomainClassifyResult> => {
    if (event.sender.isDestroyed()) {
      return { success: false, error: new Error("IPC sender was destroyed before execution.") };
    }
    const input = assertRequestObject(rawInput);
    const questionText = typeof input.question === "string" ? input.question : "";
    try {
      const classification = interviewIntelligence.classifyDomain(questionText);
      return { success: true, data: { classification } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Domain classification failed.") };
    }
  };

  const questionUnderstandHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<InterviewQuestionUnderstandResult> => {
    if (event.sender.isDestroyed()) {
      return { success: false, error: new Error("IPC sender was destroyed before execution.") };
    }
    const input = assertRequestObject(rawInput);
    const questionText = typeof input.question === "string" ? input.question : "";
    const evidenceTexts = Array.isArray(input.evidenceTexts) ? input.evidenceTexts.filter((s): s is string => typeof s === "string") : [];
    try {
      const understanding = interviewIntelligence.understandQuestion(questionText, evidenceTexts);
      return { success: true, data: { understanding } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Question understanding failed.") };
    }
  };

  const planAnswerHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<InterviewPlanAnswerResult> => {
    if (event.sender.isDestroyed()) {
      return { success: false, error: new Error("IPC sender was destroyed before execution.") };
    }
    const input = assertRequestObject(rawInput);
    const understanding = input.understanding as QuestionUnderstanding;
    const domain = (input.domain as InterviewDomain) ?? "general_employment";
    const mode = (input.responseMode as ResponseMode) ?? "professional";
    try {
      const plan = interviewIntelligence.planAnswer(understanding, domain, undefined, mode);
      return { success: true, data: { plan } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Answer planning failed.") };
    }
  };

  const evaluateAnswerHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<InterviewEvaluateAnswerResult> => {
    if (event.sender.isDestroyed()) {
      return { success: false, error: new Error("IPC sender was destroyed before execution.") };
    }
    const input = assertRequestObject(rawInput);
    const answerText = typeof input.answerText === "string" ? input.answerText : "";
    const understanding = input.questionUnderstanding as QuestionUnderstanding;
    const domain = (input.domain as InterviewDomain) ?? "general_employment";
    const targetRole = typeof input.targetRole === "string" ? input.targetRole : undefined;
    try {
      const evaluation = interviewIntelligence.evaluateAnswer({
        answerText,
        questionUnderstanding: understanding,
        domain,
        targetRole,
      });
      return { success: true, data: { evaluation } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Answer evaluation failed.") };
    }
  };

  const communicationFeedbackHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<InterviewCommunicationFeedbackResult> => {
    if (event.sender.isDestroyed()) {
      return { success: false, error: new Error("IPC sender was destroyed before execution.") };
    }
    const input = assertRequestObject(rawInput);
    const text = typeof input.text === "string" ? input.text : "";
    try {
      const feedback = interviewIntelligence.analyzeCommunication(text);
      return { success: true, data: { feedback } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Communication feedback analysis failed.") };
    }
  };

  const followUpHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<InterviewFollowUpResult> => {
    if (event.sender.isDestroyed()) {
      return { success: false, error: new Error("IPC sender was destroyed before execution.") };
    }
    const input = assertRequestObject(rawInput);
    const previousAnswer = typeof input.previousAnswer === "string" ? input.previousAnswer : "";
    const understanding = input.understanding as QuestionUnderstanding;
    const domain = (input.domain as InterviewDomain) ?? "general_employment";
    try {
      const followUps = interviewIntelligence.generateFollowUps(previousAnswer, understanding, domain);
      return { success: true, data: { followUps } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Follow-up generation failed.") };
    }
  };

  /**
   * Register handlers.
   */
  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_ANALYZE,
    analyzeHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_TASK,
    taskHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_CLASSIFY,
    taskHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_GUIDANCE,
    guidanceHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_DOMAIN_CLASSIFY,
    domainClassifyHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_QUESTION_UNDERSTAND,
    questionUnderstandHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_PLAN_ANSWER,
    planAnswerHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_EVALUATE_ANSWER,
    evaluateAnswerHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_COMMUNICATION_FEEDBACK,
    communicationFeedbackHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.INTERVIEW_FOLLOW_UP,
    followUpHandler,
  );

  /**
   * Cleanup.
   *
   * Useful for tests and controlled application lifecycle management.
   */
  return () => {
    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_ANALYZE,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_TASK,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_CLASSIFY,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_GUIDANCE,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_DOMAIN_CLASSIFY,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_QUESTION_UNDERSTAND,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_PLAN_ANSWER,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_EVALUATE_ANSWER,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_COMMUNICATION_FEEDBACK,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.INTERVIEW_FOLLOW_UP,
    );
  };
}
