import { describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";

import { IPC_CHANNELS } from "../../../shared/constants/events";
import { registerAudioRuntimeIpc } from "../../../desktop/ipc/audio-runtime.ipc";
import type { UnifiedInterviewRuntime } from "../../../core/interview/runtime/UnifiedInterviewRuntime";

function makeIpcMain() {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (...args: any[]) => Promise<unknown>) =>
        handlers.set(channel, handler),
    ),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  } as unknown as IpcMain;

  return { ipcMain, handlers };
}

describe("audio runtime IPC", () => {
  it("fails closed without a transcription adapter before starting capture", async () => {
    const { ipcMain, handlers } = makeIpcMain();
    const createCaptureLifecycle = vi.fn();
    const cleanup = registerAudioRuntimeIpc({
      ipcMain,
      runtime: {} as UnifiedInterviewRuntime,
      getActiveProfileId: () => "profile-1",
      createCaptureLifecycle,
    });

    const sender = { sender: { isDestroyed: () => false } };
    const start = handlers.get(IPC_CHANNELS.AUDIO_RUNTIME_SESSION_START);
    const result = (await start?.(sender, { sessionId: "session-1" })) as {
      readonly success: boolean;
      readonly error?: Error;
    };

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain(
      "no transcription provider is configured",
    );
    expect(createCaptureLifecycle).not.toHaveBeenCalled();

    cleanup();
  });
});
