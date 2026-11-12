import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants/events";
import type { Result } from "../../shared/types/common";
import type {
  InterviewRuntimeAnswerResult,
  InterviewRuntimeMode,
  InterviewRuntimeResponse,
  UnifiedInterviewRuntime,
  UnifiedInterviewSessionConfig,
} from "../../core/interview/runtime/UnifiedInterviewRuntime";

export interface RegisterInterviewRuntimeIpcOptions {
  readonly runtime: UnifiedInterviewRuntime;
  readonly getActiveProfileId: () => string | undefined;
  readonly ipcMain: IpcMain;
}

type State = { sessionId: string; profileId: string; candidateId?: string; mode: InterviewRuntimeMode; status: string; lastQuestionId?: string };
export type RuntimeStateResult = Result<State>;
export type RuntimeProcessResult = Result<InterviewRuntimeResponse>;
export type RuntimeAnswerResult = Result<InterviewRuntimeAnswerResult>;

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function registerInterviewRuntimeIpc(options: RegisterInterviewRuntimeIpcOptions): () => void {
  const { runtime, getActiveProfileId, ipcMain } = options;

  const requireProfile = (event: IpcMainInvokeEvent): string => {
    if (event.sender.isDestroyed()) throw new Error("IPC sender was destroyed before execution.");
    const profileId = getActiveProfileId();
    if (!profileId) throw new Error("An active candidate profile is required.");
    return profileId;
  };

  const toState = async (sessionId: string): Promise<State> => {
    const s = await runtime.getState(sessionId);
    return {
      sessionId: s.sessionId,
      profileId: s.profileId,
      candidateId: s.candidateId,
      mode: s.mode,
      status: s.status,
      lastQuestionId: s.lastQuestionId,
    };
  };

  const createHandler = async (event: IpcMainInvokeEvent, raw: unknown): Promise<RuntimeStateResult> => {
    try {
      const profileId = requireProfile(event);
      const input = asObject(raw);
      const mode = input.mode === "live" ? "live" : "practice";
      const config: UnifiedInterviewSessionConfig = {
        profileId,
        candidateId: typeof input.candidateId === "string" ? input.candidateId : undefined,
        mode,
        targetRole: typeof input.targetRole === "string" ? input.targetRole : undefined,
        domain: input.domain as any,
        interviewType: input.interviewType as any,
        jobDescription: typeof input.jobDescription === "string" ? input.jobDescription : undefined,
        questionCount: typeof input.questionCount === "number" ? input.questionCount : undefined,
        title: typeof input.title === "string" ? input.title : undefined,
      };
      const created = await runtime.createSession(config);
      return { success: true, data: await toState(created.sessionId) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to create runtime session.") };
    }
  };

  const stateHandler = (action: "start" | "pause" | "resume" | "cancel" | "complete" | "get") =>
    async (event: IpcMainInvokeEvent, raw: unknown): Promise<RuntimeStateResult> => {
      try {
        requireProfile(event);
        const sessionId = typeof asObject(raw).sessionId === "string" ? String(asObject(raw).sessionId).trim() : "";
        if (!sessionId) return { success: false, error: new Error("sessionId is required.") };
        if (action === "start") await runtime.startSession(sessionId);
        else if (action === "pause") await runtime.pauseSession(sessionId);
        else if (action === "resume") await runtime.resumeSession(sessionId);
        else if (action === "cancel") await runtime.cancelSession(sessionId, typeof asObject(raw).reason === "string" ? String(asObject(raw).reason) : undefined);
        else if (action === "complete") await runtime.completeSession(sessionId);
        return { success: true, data: await toState(sessionId) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error : new Error("Runtime session operation failed.") };
      }
    };

  const processHandler = async (event: IpcMainInvokeEvent, raw: unknown): Promise<RuntimeProcessResult> => {
    try {
      requireProfile(event);
      const input = asObject(raw);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const text = typeof input.text === "string" ? input.text : "";
      if (!sessionId || !text.trim()) return { success: false, error: new Error("sessionId and text are required.") };
      const source = (["typed", "voice_transcript", "screen_context", "practice_answer"] as const).includes(input.source as any)
        ? (input.source as any)
        : "typed";
      const result = await runtime.processQuestion({
        sessionId,
        text,
        source,
        responseMode: input.responseMode as any,
        generateAI: input.generateAI === true,
        aiProvider: typeof input.aiProvider === "string" ? input.aiProvider : undefined,
        aiRequestId: typeof input.aiRequestId === "string" ? input.aiRequestId : undefined,
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to process interview question.") };
    }
  };

  const answerHandler = async (event: IpcMainInvokeEvent, raw: unknown): Promise<RuntimeAnswerResult> => {
    try {
      requireProfile(event);
      const input = asObject(raw);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const questionId = typeof input.questionId === "string" ? input.questionId.trim() : "";
      const answerText = typeof input.answerText === "string" ? input.answerText : "";
      if (!sessionId || !questionId) return { success: false, error: new Error("sessionId and questionId are required.") };
      const result = await runtime.submitAnswer({ sessionId, questionId, answerText });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to submit runtime answer.") };
    }
  };

  ipcMain.handle(IPC_CHANNELS.RUNTIME_CREATE_SESSION, createHandler);
  ipcMain.handle(IPC_CHANNELS.RUNTIME_START_SESSION, stateHandler("start"));
  ipcMain.handle(IPC_CHANNELS.RUNTIME_PAUSE_SESSION, stateHandler("pause"));
  ipcMain.handle(IPC_CHANNELS.RUNTIME_RESUME_SESSION, stateHandler("resume"));
  ipcMain.handle(IPC_CHANNELS.RUNTIME_CANCEL_SESSION, stateHandler("cancel"));
  ipcMain.handle(IPC_CHANNELS.RUNTIME_COMPLETE_SESSION, stateHandler("complete"));
  ipcMain.handle(IPC_CHANNELS.RUNTIME_GET_STATE, stateHandler("get"));
  ipcMain.handle(IPC_CHANNELS.RUNTIME_PROCESS_QUESTION, processHandler);
  ipcMain.handle(IPC_CHANNELS.RUNTIME_SUBMIT_ANSWER, answerHandler);

  return () => {
    for (const ch of [
      IPC_CHANNELS.RUNTIME_CREATE_SESSION, IPC_CHANNELS.RUNTIME_START_SESSION, IPC_CHANNELS.RUNTIME_PAUSE_SESSION,
      IPC_CHANNELS.RUNTIME_RESUME_SESSION, IPC_CHANNELS.RUNTIME_CANCEL_SESSION, IPC_CHANNELS.RUNTIME_COMPLETE_SESSION,
      IPC_CHANNELS.RUNTIME_GET_STATE, IPC_CHANNELS.RUNTIME_PROCESS_QUESTION, IPC_CHANNELS.RUNTIME_SUBMIT_ANSWER,
    ]) ipcMain.removeHandler(ch);
  };
}
