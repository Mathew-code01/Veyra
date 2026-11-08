import { describe, expect, it, vi, beforeEach } from "vitest";

import type { AIManager as AIManagerType } from "../../../core/ai/AIManager";

import type { IpcMain } from "electron";

import { IPC_CHANNELS } from "../../../shared/constants/events";

import { registerAiIpc } from "../../../desktop/ipc/ai.ipc";

function makeSender(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
  };
}

function makeAiManager(): AIManagerType {
  return {
    generate: vi.fn(),
    healthCheck: vi.fn(),
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

describe("registerAiIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers AI generate and provider-status handlers", () => {
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handlers = handlerMap(ipcMain);

    expect(handlers.has(IPC_CHANNELS.AI_GENERATE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AI_PROVIDER_STATUS)).toBe(true);
  });

  it("generate returns a successful AI response", async () => {
    const generate = vi.fn().mockResolvedValue({
      type: "text_generation",
      text: "This is a generated answer.",
      metadata: {
        provider: "local",
        model: "local-model",
        requestId: "req-1",
        latencyMs: 42,
      },
    });

    const aiManager = {
      generate,
      healthCheck: vi.fn().mockResolvedValue([]),
    } as unknown as AIManagerType;

    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_GENERATE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        provider: "local",
        messages: [{ role: "user", content: "Say hello." }],
        requestId: "req-1",
      },
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.response.text).toBe("This is a generated answer.");
      expect(result.data.response.metadata.provider).toBe("local");
    }

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("generate defaults to the local provider when none is specified", async () => {
    const generate = vi.fn().mockResolvedValue({
      type: "text_generation",
      text: "ok",
      metadata: {
        provider: "local",
        model: "local-model",
        requestId: "req-2",
        latencyMs: 5,
      },
    });

    const aiManager = { generate, healthCheck: vi.fn().mockResolvedValue([]) } as unknown as AIManagerType;

    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_GENERATE,
    ) as (event: unknown, request?: unknown) => unknown;

    await handler(
      { sender: makeSender() },
      {
        messages: [{ role: "user", content: "hi" }],
        requestId: "req-2",
      },
    );

    expect(generate).toHaveBeenCalledWith("local", expect.anything());
  });

  it("generate returns a failure result when the provider throws", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("provider unavailable"));

    const aiManager = { generate, healthCheck: vi.fn().mockResolvedValue([]) } as unknown as AIManagerType;

    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_GENERATE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        provider: "cloud:gemini",
        messages: [{ role: "user", content: "hi" }],
        requestId: "req-3",
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toBe("provider unavailable");
    }
  });

  it("generate returns a failure result when no request is supplied", async () => {
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_GENERATE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(false);
  });

  it("generate rejects when the IPC sender is destroyed", async () => {
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_GENERATE,
    ) as (event: unknown, request?: unknown) => unknown;

    await expect(
      handler({ sender: makeSender(true) }, {
        messages: [{ role: "user", content: "hi" }],
        requestId: "req-4",
      }),
    ).rejects.toThrow(/sender is no longer available/);
  });

  it("provider-status returns provider health results", async () => {
    const healthCheck = vi.fn().mockResolvedValue([
      {
        provider: "local",
        status: "healthy",
        checkedAt: Date.now(),
      },
    ]);

    const aiManager = {
      generate: vi.fn(),
      healthCheck,
    } as unknown as AIManagerType;

    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_PROVIDER_STATUS,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, { forceRefresh: true });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providers).toHaveLength(1);
      expect(result.data.providers[0].provider).toBe("local");
      expect(result.data.providers[0].status).toBe("healthy");
    }
  });

  it("provider-status returns a failure result when health check throws", async () => {
    const healthCheck = vi.fn().mockRejectedValue(new Error("health check failed"));

    const aiManager = {
      generate: vi.fn(),
      healthCheck,
    } as unknown as AIManagerType;

    const ipcMain = makeIpcMain();

    registerAiIpc({ aiManager, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.AI_PROVIDER_STATUS,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(false);
  });

  it("cleanup removes the registered handlers", () => {
    const aiManager = makeAiManager();
    const ipcMain = makeIpcMain();

    const cleanup = registerAiIpc({ aiManager, ipcMain });

    cleanup();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.AI_GENERATE);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.AI_PROVIDER_STATUS);
  });
});
