// ============================================================================
// FILE: desktop/ipc/practice.ipc.ts
//
// PURPOSE:
// IPC handlers for Practice and Mock Interview Sessions.
// Enforces sender validation and active profile ownership.
// ============================================================================

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants/events";
import type { Result } from "../../shared/types/common";
import type {
  PracticeAnswerResult,
  PracticeQuestionView,
  PracticeSessionConfig,
  PracticeSessionEngine,
  PracticeSessionState,
} from "../../core/interview/practice/PracticeSessionEngine";
import type { PracticeSessionReport } from "../../database/schema/sessions";
import { INTERVIEW_DOMAINS } from "../../shared/constants/interviewDomains";

export interface RegisterPracticeIpcOptions {
  readonly practiceEngine: PracticeSessionEngine;
  readonly getActiveProfileId: () => string | undefined;
  readonly ipcMain: IpcMain;
}

export type PracticeSessionResult = Result<PracticeSessionState>;
export type PracticeSessionListResult = Result<readonly PracticeSessionState[]>;
export type PracticeAnswerIpcResult = Result<PracticeAnswerResult>;
export type PracticeQuestionIpcResult = Result<PracticeQuestionView | undefined>;
export type PracticeReportIpcResult = Result<PracticeSessionReport>;

function assertRequestObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function registerPracticeIpc(options: RegisterPracticeIpcOptions): () => void {
  const { practiceEngine, getActiveProfileId, ipcMain } = options;

  const requireActiveProfile = (event: IpcMainInvokeEvent): string => {
    if (event.sender.isDestroyed()) {
      throw new Error("IPC sender was destroyed before execution.");
    }
    const profileId = getActiveProfileId();
    if (!profileId) {
      throw new Error("An active candidate profile is required for practice sessions.");
    }
    return profileId;
  };
  const requireOwnedSession = async (event: IpcMainInvokeEvent, sessionId: string): Promise<PracticeSessionState> => {
    const profileId = requireActiveProfile(event);
    const session = await practiceEngine.getSessionState(sessionId);
    if (session.profileId !== profileId) throw new Error("Practice session does not belong to the active candidate profile.");
    return session;
  };

  const createHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeSessionResult> => {
    try {
      const profileId = requireActiveProfile(event);
      const input = assertRequestObject(rawInput);
      const targetRole = typeof input.targetRole === "string" ? input.targetRole.trim() : "";
      if (!targetRole || targetRole.length > 160) {
        return { success: false, error: new Error("Enter a target role of 1–160 characters.") };
      }
      const modeValues = ["behavioral", "technical", "coding", "system_design", "product", "case", "communication", "mixed"] as const;
      const difficultyValues = ["beginner", "intermediate", "advanced"] as const;
      const experienceValues = ["entry", "mid", "senior", "lead", "executive"] as const;

      const config: PracticeSessionConfig = {
        profileId,
        targetRole,
        title: typeof input.title === "string" ? input.title.trim() : undefined,
        jobDescription: typeof input.jobDescription === "string" ? input.jobDescription.trim().slice(0, 8000) : undefined,
        domain: INTERVIEW_DOMAINS.includes(input.domain as typeof INTERVIEW_DOMAINS[number]) ? input.domain as PracticeSessionConfig["domain"] : undefined,
        interviewType: modeValues.includes(input.interviewType as typeof modeValues[number]) ? input.interviewType as PracticeSessionConfig["interviewType"] : "mixed",
        experienceLevel: experienceValues.includes(input.experienceLevel as typeof experienceValues[number]) ? input.experienceLevel as PracticeSessionConfig["experienceLevel"] : "mid",
        difficulty: difficultyValues.includes(input.difficulty as typeof difficultyValues[number]) ? input.difficulty as PracticeSessionConfig["difficulty"] : "intermediate",
        candidateId: typeof input.candidateId === "string" ? input.candidateId.trim().slice(0, 80) : undefined,
        questionCount: typeof input.questionCount === "number" && Number.isInteger(input.questionCount) ? Math.min(20, Math.max(3, input.questionCount)) : 5,
      };

      const session = await practiceEngine.createSession(config);
      await practiceEngine.startSession(session.id);
      const started = await practiceEngine.getSessionState(session.id);
      return { success: true, data: started };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to create practice session.") };
    }
  };

  const getHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeSessionResult> => {
    try {
      const profileId = requireActiveProfile(event);
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) return { success: false, error: new Error("Session ID is required.") };
      const session = await practiceEngine.getSessionState(sessionId);
      if (session.profileId !== profileId) throw new Error("Practice session does not belong to the active candidate profile.");
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to retrieve practice session.") };
    }
  };

  const listHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<PracticeSessionListResult> => {
    try {
      const profileId = requireActiveProfile(event);
      const sessions = await practiceEngine.listSessions(profileId);
      return { success: true, data: sessions };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to list practice sessions.") };
    }
  };

  const answerHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeAnswerIpcResult> => {
    try {
      requireActiveProfile(event);
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const questionId = typeof input.questionId === "string" ? input.questionId.trim() : "";
      const text = typeof input.answerText === "string" ? input.answerText.trim() : "";
      if (!sessionId || !questionId) {
        return { success: false, error: new Error("Session ID and Question ID are required.") };
      }
      const session = await requireOwnedSession(event, sessionId);
      if (session.status !== "active") return { success: false, error: new Error("Resume this practice session before submitting an answer.") };
      if (typeof input.answerText !== "string" || !input.answerText.trim() || input.answerText.length > 12000) return { success: false, error: new Error("Answer must contain 1–12,000 characters.") };
      const result = await practiceEngine.submitAnswer(sessionId, questionId, text);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to submit answer.") };
    }
  };

  const nextQuestionHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeQuestionIpcResult> => {
    try {
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) return { success: false, error: new Error("Session ID is required.") };
      await requireOwnedSession(event, sessionId);
      const nextQ = await practiceEngine.nextQuestion(sessionId);
      return { success: true, data: nextQ };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to fetch next question.") };
    }
  };

  const pauseHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeSessionResult> => {
    try {
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) return { success: false, error: new Error("Session ID is required.") };
      await requireOwnedSession(event, sessionId);
      const paused = await practiceEngine.pauseSession(sessionId);
      return { success: true, data: paused };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to pause session.") };
    }
  };

  const resumeHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeSessionResult> => {
    try {
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) return { success: false, error: new Error("Session ID is required.") };
      await requireOwnedSession(event, sessionId);
      const resumed = await practiceEngine.resumeSession(sessionId);
      return { success: true, data: resumed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to resume session.") };
    }
  };

  const completeHandler = async (
    event: IpcMainInvokeEvent,
    rawInput: unknown,
  ): Promise<PracticeReportIpcResult> => {
    try {
      const profileId = requireActiveProfile(event);
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) return { success: false, error: new Error("Session ID is required.") };
      const session = await practiceEngine.getSessionState(sessionId);
      if (session.profileId !== profileId) throw new Error("Practice session does not belong to the active candidate profile.");
      const report = await practiceEngine.completeSession(sessionId);
      return { success: true, data: report };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to complete session.") };
    }
  };

  const reportHandler = async (event: IpcMainInvokeEvent, rawInput: unknown): Promise<PracticeReportIpcResult> => {
    try {
      const profileId = requireActiveProfile(event);
      const input = assertRequestObject(rawInput);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) return { success: false, error: new Error("Session ID is required.") };
      const session = await practiceEngine.getSessionState(sessionId);
      if (session.profileId !== profileId) throw new Error("Practice session does not belong to the active candidate profile.");
      return { success: true, data: practiceEngine.getSessionReport(sessionId) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error("Failed to retrieve practice report.") };
    }
  };

  ipcMain.handle(IPC_CHANNELS.PRACTICE_CREATE_SESSION, createHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_GET_SESSION, getHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_LIST_SESSIONS, listHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_SUBMIT_ANSWER, answerHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_NEXT_QUESTION, nextQuestionHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_PAUSE_SESSION, pauseHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_RESUME_SESSION, resumeHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_COMPLETE_SESSION, completeHandler);
  ipcMain.handle(IPC_CHANNELS.PRACTICE_GET_REPORT, reportHandler);

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_CREATE_SESSION);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_GET_SESSION);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_LIST_SESSIONS);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_SUBMIT_ANSWER);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_NEXT_QUESTION);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_PAUSE_SESSION);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_RESUME_SESSION);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_COMPLETE_SESSION);
    ipcMain.removeHandler(IPC_CHANNELS.PRACTICE_GET_REPORT);
  };
}
