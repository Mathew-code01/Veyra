import { describe, expect, it, vi, beforeEach } from "vitest";

import type { AIManager as AIManagerType } from "../../../core/ai/AIManager";

import type { IpcMain } from "electron";

import type {
  InterviewIntelligence as InterviewIntelligenceType,
} from "../../../core/interview/services/InterviewIntelligence";

import { IPC_CHANNELS } from "../../../shared/constants/events";

import { registerInterviewIpc } from "../../../desktop/ipc/interview.ipc";

function makeSender(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
  };
}

function makeIntelligence(): InterviewIntelligenceType {
  return {
    analyze: vi.fn(),
    detectTask: vi.fn(),
    analyzeForAI: vi.fn(),
  } as unknown as InterviewIntelligenceType;
}

function makeAiManager(): AIManagerType {
  return {
    generate: vi.fn(),
  } as unknown as AIManagerType;
}

function makeIpcMain(): IpcMain {
  return {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  } as unknown as IpcMain;
}

function handlerMap(ipcMain: IpcMain): Map<string, unknown> {
  const map = new Map<string, unknown>();

  const handle = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

  for (const call of handle.mock.calls) {
    map.set(call[0], call[1]);
  }

  return map;
}

const conversation = {
  turn: { id: "turn-1", text: "Tell me about your experience with React.", type: "question" },
  question: { text: "Tell me about your experience with React.", type: "interview" },
  messages: [],
  summary: "",
  detectedAt: new Date().toISOString(),
} as unknown;

const classification = {
  type: "behavioral",
  confidence: 0.9,
  alternatives: [],
  signals: ["behavioral prompt"],
} as unknown;

describe("registerInterviewIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers analyze, task, classify, and guidance handlers", () => {
    const intelligence = makeIntelligence();
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handlers = handlerMap(ipcMain);

    expect(handlers.has(IPC_CHANNELS.INTERVIEW_ANALYZE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.INTERVIEW_TASK)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.INTERVIEW_CLASSIFY)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.INTERVIEW_GUIDANCE)).toBe(true);
  });

  it("interview:analyze returns the interview analysis", async () => {
    const analysis = {
      classification,
      currentTask: {
        id: "task-1",
        type: "behavioral",
        questionText: "Tell me about your experience with React.",
        requiresResponse: true,
        confidence: 0.9,
      },
      conversation: { turn: { id: "turn-1", text: "hi", type: "question" } },
      confidence: 0.85,
      signals: [],
      candidateId: "cand-1",
    } as unknown;

    const intelligence = makeIntelligence();
    intelligence.analyze.mockResolvedValue({ analysis } as never);

    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.INTERVIEW_ANALYZE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        conversation,
        candidateId: "cand-1",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.analysis).toBe(analysis);
    }

    expect(intelligence.analyze).toHaveBeenCalledTimes(1);
    const analyzeCall = intelligence.analyze.mock.calls[0][0];
    expect(analyzeCall.candidateId).toBe("cand-1");
    expect(analyzeCall.signal).toBeUndefined();
  });

  it("interview:task returns the detected task", async () => {
    const task = {
      id: "task-1",
      type: "behavioral",
      questionText: "Tell me about your experience with React.",
      requiresResponse: true,
      confidence: 0.9,
    };

    const intelligence = makeIntelligence();
    intelligence.detectTask.mockResolvedValue({ task } as never);

    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.INTERVIEW_TASK,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        analysis: { classification } as never,
        classification,
        candidateId: "cand-1",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task).toBe(task);
    }
  });

  it("interview:classify shares the task-detection handler", async () => {
    const intelligence = makeIntelligence();
    intelligence.detectTask.mockResolvedValue({} as never);

    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handlers = handlerMap(ipcMain);

    const taskHandler = handlers.get(IPC_CHANNELS.INTERVIEW_TASK);
    const classifyHandler = handlers.get(IPC_CHANNELS.INTERVIEW_CLASSIFY);

    expect(taskHandler).toBe(classifyHandler);
  });

  it("interview:guidance executes analysis and AI generation", async () => {
    const aiRequest = {
      requestId: "req-1",
      provider: "local",
      model: "local-model",
      messages: [{ role: "user", content: "prompt" }],
      signal: undefined,
    };

    const analysis = {
      classification,
      currentTask: {
        id: "task-1",
        type: "behavioral",
        questionText: "Tell me about your experience with React.",
        requiresResponse: true,
        confidence: 0.9,
      },
      conversation: { turn: { id: "turn-1", text: "hi", type: "question" } },
      confidence: 0.85,
      signals: [],
      candidateId: "cand-1",
    } as unknown;

    const intelligence = makeIntelligence();
    intelligence.analyzeForAI.mockResolvedValue({
      analysis,
      aiRequest,
      context: { text: "relevant context", query: "q", contextIds: [] },
    } as never);

    const generate = vi.fn().mockResolvedValue({
      type: "text_generation",
      text: "Generated interview answer.",
      metadata: {
        provider: "local",
        model: "local-model",
        requestId: "req-1",
        latencyMs: 100,
      },
    });

    const aiManager = { generate } as unknown as AIManagerType;
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.INTERVIEW_GUIDANCE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        conversation,
        candidateId: "cand-1",
        requestId: "req-1",
        provider: "local",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.analysis).toBe(analysis);
      expect(result.data.response?.text).toBe("Generated interview answer.");
      expect(result.data.contextText).toBe("relevant context");
      expect(result.data.candidateId).toBe("cand-1");
      expect(result.data.aiRequest?.signal).toBeUndefined();
    }

    expect(intelligence.analyzeForAI).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("interview:guidance returns failure when no requestId is supplied", async () => {
    const intelligence = makeIntelligence();
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.INTERVIEW_GUIDANCE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      { conversation, requestId: "" },
    );

    expect(result.success).toBe(false);
    expect(intelligence.analyzeForAI).not.toHaveBeenCalled();
  });

  it("interview:guidance returns failure when AI generation throws", async () => {
    const aiRequest = {
      requestId: "req-1",
      provider: "local",
      messages: [{ role: "user", content: "prompt" }],
    };

    const intelligence = makeIntelligence();
    intelligence.analyzeForAI.mockResolvedValue({
      analysis: { classification } as never,
      aiRequest,
    } as never);

    const generate = vi.fn().mockRejectedValue(new Error("generation failed"));

    const aiManager = { generate } as unknown as AIManagerType;
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.INTERVIEW_GUIDANCE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      { conversation, requestId: "req-1" },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as Error).message).toBe("generation failed");
    }
  });

  it("interview:guidance returns failure when analysis throws", async () => {
    const intelligence = makeIntelligence();
    intelligence.analyzeForAI.mockRejectedValue(new Error("analysis failed"));

    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerInterviewIpc({ interviewIntelligence: intelligence, aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.INTERVIEW_GUIDANCE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      { conversation, requestId: "req-1" },
    );

    expect(result.success).toBe(false);
  });

  it("cleanup removes the registered handlers", () => {
    const intelligence = makeIntelligence();
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    const cleanup = registerInterviewIpc({
      interviewIntelligence: intelligence,
      aiManager,
      ipcMain,
    });

    cleanup();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.INTERVIEW_ANALYZE);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.INTERVIEW_TASK);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.INTERVIEW_CLASSIFY);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.INTERVIEW_GUIDANCE);
  });
});
