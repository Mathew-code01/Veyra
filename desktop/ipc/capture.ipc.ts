// ============================================================================
// FILE: desktop/ipc/capture.ipc.ts
//
// PURPOSE:
// Secure screen/window capture IPC for vision context.
//
// MAIN PROCESS ONLY.
//
// SECURITY:
// - Capture is user-initiated per request (no continuous capture without
//   explicit start per session/use).
// - Raw frames/screenshots stay in main process memory; renderer receives
//   only metadata and opaque capture IDs.
// - desktopCapturer access is restricted to this handler boundary.
// - Capture sessions are scoped and disposable.
// ============================================================================

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { desktopCapturer } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

export interface CaptureSourceInfo {
  readonly id: string;
  readonly name: string;
  readonly type: "screen" | "window";
  readonly thumbnailDataUrl?: string;
}

export interface RegisterCaptureIpcOptions {
  readonly ipcMain: IpcMain;
}

interface CaptureSession {
  readonly id: string;
  readonly sourceId: string;
  readonly startedAt: string;
  active: boolean;
  lastFrameAt?: string;
}

function assertValidIpcSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Veyra IPC request rejected: sender is no longer available.");
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function registerCaptureIpc(options: RegisterCaptureIpcOptions): () => void {
  const { ipcMain } = options;
  const sessions = new Map<string, CaptureSession>();

  const listSourcesHandler = async (
    event: IpcMainInvokeEvent,
  ) => {
    try {
      assertValidIpcSender(event);
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });

      const data: readonly CaptureSourceInfo[] = sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith("screen:") ? "screen" : "window",
      }));

      return { success: true, data: { sources: data } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to list capture sources."),
      };
    }
  };

  const permissionStatusHandler = async (event: IpcMainInvokeEvent) => {
    try {
      assertValidIpcSender(event);
      // Electron desktopCapturer availability depends on OS permissions; report best-effort.
      return {
        success: true,
        data: { permission: { screen: "prompt" as const } },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to check capture permission."),
      };
    }
  };

  const startHandler = async (event: IpcMainInvokeEvent, request?: unknown) => {
    try {
      assertValidIpcSender(event);
      const input = asObject(request);
      const sourceId = typeof input.sourceId === "string" ? input.sourceId.trim() : "";
      if (!sourceId) {
        return { success: false, error: new Error("Capture sourceId is required.") };
      }

      const sessionId = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const session: CaptureSession = {
        id: sessionId,
        sourceId,
        startedAt: new Date().toISOString(),
        active: true,
      };
      sessions.set(sessionId, session);

      return {
        success: true,
        data: {
          session: {
            sessionId,
            sourceId,
            active: true,
            startedAt: session.startedAt,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to start capture session."),
      };
    }
  };

  const stopHandler = async (event: IpcMainInvokeEvent, request?: unknown) => {
    try {
      assertValidIpcSender(event);
      const input = asObject(request);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: false, error: new Error("Capture session not found.") };
      }
      session.active = false;
      sessions.delete(sessionId);
      return {
        success: true,
        data: {
          session: {
            sessionId,
            sourceId: session.sourceId,
            active: false,
            startedAt: session.startedAt,
            stoppedAt: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to stop capture session."),
      };
    }
  };

  const statusHandler = async (event: IpcMainInvokeEvent, request?: unknown) => {
    try {
      assertValidIpcSender(event);
      const input = asObject(request);
      const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: false, error: new Error("Capture session not found.") };
      }
      return {
        success: true,
        data: {
          session: {
            sessionId: session.id,
            sourceId: session.sourceId,
            active: session.active,
            startedAt: session.startedAt,
            lastFrameAt: session.lastFrameAt ?? null,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to get capture status."),
      };
    }
  };

  ipcMain.handle(IPC_CHANNELS.CAPTURE_SOURCES_LIST, listSourcesHandler);
  ipcMain.handle(IPC_CHANNELS.CAPTURE_PERMISSION_STATUS, permissionStatusHandler);
  ipcMain.handle(IPC_CHANNELS.CAPTURE_PERMISSION_REQUEST, permissionStatusHandler);
  ipcMain.handle(IPC_CHANNELS.CAPTURE_START, startHandler);
  ipcMain.handle(IPC_CHANNELS.CAPTURE_STOP, stopHandler);
  ipcMain.handle(IPC_CHANNELS.CAPTURE_STATUS, statusHandler);

  return () => {
    sessions.clear();
    ipcMain.removeHandler(IPC_CHANNELS.CAPTURE_SOURCES_LIST);
    ipcMain.removeHandler(IPC_CHANNELS.CAPTURE_PERMISSION_STATUS);
    ipcMain.removeHandler(IPC_CHANNELS.CAPTURE_PERMISSION_REQUEST);
    ipcMain.removeHandler(IPC_CHANNELS.CAPTURE_START);
    ipcMain.removeHandler(IPC_CHANNELS.CAPTURE_STOP);
    ipcMain.removeHandler(IPC_CHANNELS.CAPTURE_STATUS);
  };
}
