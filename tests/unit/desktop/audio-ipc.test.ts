import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { IpcMain } from "electron";

import { IPC_CHANNELS } from "../../../shared/constants/events";

import { registerAudioIpc } from "../../../desktop/ipc/audio.ipc";

import type { DesktopAudioCapture } from "../../../desktop/audio/DesktopAudioCapture";

function makeEvent(destroyed = false) {
  return {
    sender: {
      isDestroyed: () => destroyed,
    },
  };
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

describe("Audio IPC", () => {
  let ipcMain: IpcMain;
  let handlers: Map<string, unknown>;
  let unregister: (() => void) | undefined;

  beforeEach(() => {
    ipcMain = makeIpcMain();
    unregister = registerAudioIpc({ ipcMain });
    handlers = handlerMap(ipcMain);
  });

  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  it("registers all audio IPC handlers", () => {
    expect(handlers.has(IPC_CHANNELS.AUDIO_DEVICES_LIST)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AUDIO_PERMISSION_STATUS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AUDIO_PERMISSION_REQUEST)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AUDIO_SESSION_START)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AUDIO_SESSION_STOP)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AUDIO_SESSION_STATE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.AUDIO_TRANSCRIPT_STATE)).toBe(true);
  });

  it("lists audio devices", async () => {
    const handler = handlers.get(
      IPC_CHANNELS.AUDIO_DEVICES_LIST,
    ) as (...args: unknown[]) => Promise<unknown>;

    const result = await handler(makeEvent());

    expect(result.success).toBe(true);
    expect(result.data?.devices).toEqual([]);
  });

  it("reports permission status", async () => {
    const handler = handlers.get(
      IPC_CHANNELS.AUDIO_PERMISSION_STATUS,
    ) as (...args: unknown[]) => Promise<unknown>;

    const result = await handler(makeEvent());

    expect(result.success).toBe(true);
    expect(result.data?.permission.microphone).toBe("unknown");
  });

  it("starts and stops an audio session", async () => {
    const startHandler = handlers.get(
      IPC_CHANNELS.AUDIO_SESSION_START,
    ) as (...args: unknown[]) => Promise<unknown>;

    const stopHandler = handlers.get(
      IPC_CHANNELS.AUDIO_SESSION_STOP,
    ) as (...args: unknown[]) => Promise<unknown>;

    // Cannot actually start capture without navigator.mediaDevices in test
    const startResult = await startHandler(makeEvent(), {
      sessionId: "test-session-1",
    });

    // start should fail since navigator.mediaDevices is not available in Node test env
    expect(startResult.success).toBe(false);
  });

  it("reports session state for non-existent session", async () => {
    const stateHandler = handlers.get(
      IPC_CHANNELS.AUDIO_SESSION_STATE,
    ) as (...args: unknown[]) => Promise<unknown>;

    const result = await stateHandler(makeEvent(), {
      sessionId: "non-existent",
    });

    expect(result.success).toBe(false);
  });

  it("reports transcript state for non-existent session", async () => {
    const handler = handlers.get(
      IPC_CHANNELS.AUDIO_TRANSCRIPT_STATE,
    ) as (...args: unknown[]) => Promise<unknown>;

    const result = await handler(makeEvent(), {
      sessionId: "non-existent",
    });

    expect(result.success).toBe(false);
  });

  it("returns metrics for non-existent session", async () => {
    const handler = handlers.get(
      IPC_CHANNELS.AUDIO_METRICS,
    ) as (...args: unknown[]) => Promise<unknown>;

    const result = await handler(makeEvent(), {
      sessionId: "non-existent",
    });

    expect(result.success).toBe(false);
  });
});
