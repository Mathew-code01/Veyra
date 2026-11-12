import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/constants/events";
import { registerInterviewRuntimeIpc } from "../../../desktop/ipc/interview-runtime.ipc";

function makeIpcMain() {
  const handlers = new Map<string, any>();
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: any) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    } as unknown as IpcMain,
    handlers,
  };
}

describe("registerInterviewRuntimeIpc", () => {
  let runtime: any;
  let ipcMain: IpcMain;
  let handlers: Map<string, any>;
  let cleanup: () => void;

  beforeEach(() => {
    ({ ipcMain, handlers } = makeIpcMain());
    runtime = {
      createSession: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "practice", status: "draft", turns: [] })),
      startSession: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "practice", status: "active", turns: [] })),
      pauseSession: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "live", status: "paused", turns: [] })),
      resumeSession: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "live", status: "active", turns: [] })),
      cancelSession: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "live", status: "failed", turns: [] })),
      completeSession: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "practice", status: "completed", turns: [] })),
      getState: vi.fn(async () => ({ sessionId: "s1", profileId: "p1", mode: "practice", status: "active", turns: [], lastQuestionId: "q1" })),
      processQuestion: vi.fn(async () => ({ sessionId: "s1", mode: "live", source: "typed", questionText: "Q", questionId: "q1", evidence: [], provenance: { candidateEvidenceIds: [], memoryIds: [], contextIds: [], factsGrounded: false, assumptions: [], missingInformation: [] }, confidence: 0.5, followUps: [] })),
      submitAnswer: vi.fn(async () => ({ sessionId: "s1", questionId: "q1", answerId: "a1", evaluation: { overallScore: 70 }, communication: { overallRating: "good" }, completed: false, evidence: [], provenance: { candidateEvidenceIds: [], memoryIds: [], contextIds: [], factsGrounded: false, assumptions: [], missingInformation: [] }, followUps: [] })),
    };
    cleanup = registerInterviewRuntimeIpc({
      runtime,
      getActiveProfileId: () => "p1",
      ipcMain,
    });
  });

  const sender = { sender: { isDestroyed: () => false } } as any;

  it("requires active profile and valid sender", async () => {
    cleanup();
    ({ ipcMain, handlers } = makeIpcMain());
    registerInterviewRuntimeIpc({ runtime, getActiveProfileId: () => undefined, ipcMain });
    const h = handlers.get(IPC_CHANNELS.RUNTIME_CREATE_SESSION);
    const res = await h(sender, { mode: "practice", targetRole: "Engineer" });
    expect(res.success).toBe(false);
  });

  it("creates and controls runtime sessions via validated IPC", async () => {
    const create = handlers.get(IPC_CHANNELS.RUNTIME_CREATE_SESSION);
    const created = await create(sender, { mode: "practice", targetRole: "Engineer", questionCount: 3 });
    expect(created.success).toBe(true);
    expect(runtime.createSession).toHaveBeenCalled();

    const start = handlers.get(IPC_CHANNELS.RUNTIME_START_SESSION);
    expect((await start(sender, { sessionId: "s1" })).success).toBe(true);
    expect(runtime.startSession).toHaveBeenCalledWith("s1");

    const pause = handlers.get(IPC_CHANNELS.RUNTIME_PAUSE_SESSION);
    expect((await pause(sender, { sessionId: "s1" })).success).toBe(true);
    const resume = handlers.get(IPC_CHANNELS.RUNTIME_RESUME_SESSION);
    expect((await resume(sender, { sessionId: "s1" })).success).toBe(true);
    const cancel = handlers.get(IPC_CHANNELS.RUNTIME_CANCEL_SESSION);
    expect((await cancel(sender, { sessionId: "s1", reason: "user" })).success).toBe(true);
    expect(runtime.cancelSession).toHaveBeenCalledWith("s1", "user");
  });

  it("processes questions and submits answers through canonical runtime", async () => {
    const process = handlers.get(IPC_CHANNELS.RUNTIME_PROCESS_QUESTION);
    const q = await process(sender, { sessionId: "s1", text: "Tell me about yourself", source: "voice_transcript", generateAI: false });
    expect(q.success).toBe(true);
    expect(runtime.processQuestion).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1", source: "voice_transcript", generateAI: false }));

    const submit = handlers.get(IPC_CHANNELS.RUNTIME_SUBMIT_ANSWER);
    const a = await submit(sender, { sessionId: "s1", questionId: "q1", answerText: "I am..." });
    expect(a.success).toBe(true);
    expect(runtime.submitAnswer).toHaveBeenCalledWith({ sessionId: "s1", questionId: "q1", answerText: "I am..." });
  });

  it("cleans up handlers", () => {
    cleanup();
    expect((ipcMain.removeHandler as any).mock.calls.length).toBeGreaterThanOrEqual(9);
  });
});
