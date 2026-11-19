// ============================================================================
// FILE: desktop/windows/overlayWindow.ts
//
// PURPOSE:
// Creates and manages the transparent, floating interview copilot overlay
// window. The overlay is a frameless, always-on-top BrowserWindow that loads
// the Veyra client in overlay mode and renders guidance on top of the user's
// interview application.
//
// SECURITY:
// - No raw audio, screen frames, or filesystem paths are exposed to the
//   overlay renderer. All data arrives via prevalidated IPC/preload APIs.
// - The overlay never captures itself; screen capture is separate and
//   user-initiated.
// - Window creation happens only in the main process.
// ============================================================================

import { BrowserWindow, screen } from "electron";
import path from "node:path";

import { IPC_CHANNELS } from "../../shared/constants/events";

let overlayWindow: BrowserWindow | null = null;

const isDevelopment = process.env.NODE_ENV === "development";

const rendererUrl = process.env.VEYRA_RENDERER_URL ?? "http://localhost:5174";

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 360;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;

// In-memory position/size persistence across overlay show/hide cycles.
// Keyed by "overlay" so multiple callers share one persisted layout.
let overlayLayout: {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly opacity?: number;
  readonly alwaysOnTop?: boolean;
} = {};

function getPrimaryWorkArea() {
  const display = screen.getPrimaryDisplay();
  return display.workArea;
}

export function isOverlayAvailable(): boolean {
  return Boolean(overlayWindow && !overlayWindow.isDestroyed());
}

export function getOverlayWindow(): BrowserWindow | null {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return null;
  }
  return overlayWindow;
}

export function getOverlayLayout() {
  return { ...overlayLayout };
}

export function createOverlayWindow(opts?: {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly opacity?: number;
  readonly alwaysOnTop?: boolean;
  readonly showOnCreate?: boolean;
  readonly sessionId?: string;
}): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (opts?.sessionId) {
      void loadOverlayRenderer(overlayWindow, opts.sessionId);
    }
    if (overlayWindow.isMinimized()) {
      overlayWindow.restore();
    }
    overlayWindow.focus();
    return overlayWindow;
  }

  const workArea = getPrimaryWorkArea();

  const width = opts?.width ?? overlayLayout.width ?? DEFAULT_WIDTH;
  const height = opts?.height ?? overlayLayout.height ?? DEFAULT_HEIGHT;
  const x =
    opts?.x ?? overlayLayout.x ?? Math.round(workArea.x + workArea.width - width - 40);
  const y =
    opts?.y ?? overlayLayout.y ?? Math.round(workArea.y + 40);

  const window = new BrowserWindow({
    width: Math.min(width, workArea.width),
    height: Math.min(height, workArea.height),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    x,
    y,
    show: opts?.showOnCreate !== false,
    frame: false,
    transparent: true,
    alwaysOnTop: opts?.alwaysOnTop ?? overlayLayout.alwaysOnTop ?? true,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    title: "Veyra Overlay",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  overlayWindow = window;

  window.setOpacity(opts?.opacity ?? overlayLayout.opacity ?? 0.9);

  void loadOverlayRenderer(window, opts?.sessionId);

  window.on("blur", () => {
    // Do not auto-hide; the user controls visibility via hide/toggle.
  });

  window.on("resized", () => {
    if (!window.isDestroyed()) {
      const [w, h] = window.getSize();
      const [px, py] = window.getPosition();
      overlayLayout = { ...overlayLayout, x: px, y: py, width: w, height: h };
    }
  });

  window.on("moved", () => {
    if (!window.isDestroyed()) {
      const [px, py] = window.getPosition();
      const [w, h] = window.getSize();
      overlayLayout = { ...overlayLayout, x: px, y: py, width: w, height: h };
    }
  });

  window.on("closed", () => {
    if (overlayWindow === window) {
      overlayWindow = null;
    }
  });

  return window;
}

async function loadOverlayRenderer(window: BrowserWindow, sessionId?: string): Promise<void> {
  try {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    if (isDevelopment) {
      await window.loadURL(`${rendererUrl}/overlay${query}`);
      if (process.env.VEYRA_DEVTOOLS === "true") {
        window.webContents.openDevTools({ mode: "detach" });
      }
      return;
    }

    const indexPath = path.join(__dirname, "../../client/dist/index.html");
    await window.loadFile(indexPath, { hash: `/overlay${query}` });
  } catch (error) {
    console.error("[Veyra] Failed to load overlay renderer.", error);
  }
}

export function destroyOverlayWindow(): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  if (!window.isDestroyed()) {
    const [px, py] = window.getPosition();
    const [w, h] = window.getSize();
    overlayLayout = { ...overlayLayout, x: px, y: py, width: w, height: h };
    window.destroy();
  }
  overlayWindow = null;
}

export function focusOverlayWindow(): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

export function hideOverlayWindow(): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  window.hide();
}

export function showOverlayWindow(sessionId?: string): void {
  const existingWindow = getOverlayWindow();
  const window = existingWindow ?? createOverlayWindow({ showOnCreate: true, sessionId });
  if (existingWindow && sessionId) {
    void loadOverlayRenderer(window, sessionId);
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

export function toggleOverlayWindow(): void {
  const window = getOverlayWindow();
  if (window && !window.isDestroyed() && window.isVisible()) {
    hideOverlayWindow();
  } else {
    showOverlayWindow();
  }
}

export function setOverlayOpacity(opacity: number): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  const clamped = Math.min(1, Math.max(0.1, opacity));
  window.setOpacity(clamped);
  overlayLayout = { ...overlayLayout, opacity: clamped };
}

export function setOverlayAlwaysOnTop(alwaysOnTop: boolean): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  window.setAlwaysOnTop(alwaysOnTop);
  overlayLayout = { ...overlayLayout, alwaysOnTop };
}

export function setOverlayPosition(x: number, y: number): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  window.setPosition(x, y);
  overlayLayout = { ...overlayLayout, x, y };
}

export function setOverlaySize(width: number, height: number): void {
  const window = getOverlayWindow();
  if (!window) {
    return;
  }
  window.setSize(width, height);
  overlayLayout = { ...overlayLayout, width, height };
}

export function getOverlayState() {
  const window = getOverlayWindow();
  if (!window) {
    return {
      visible: false,
      alwaysOnTop: overlayLayout.alwaysOnTop ?? true,
      opacity: overlayLayout.opacity ?? 0.9,
      x: overlayLayout.x,
      y: overlayLayout.y,
      width: overlayLayout.width,
      height: overlayLayout.height,
    };
  }
  const [px, py] = window.getPosition();
  const [w, h] = window.getSize();
  return {
    visible: window.isVisible(),
    alwaysOnTop: window.isAlwaysOnTop(),
    opacity: window.getOpacity(),
    x: px,
    y: py,
    width: w,
    height: h,
  };
}

export function registerOverlayIpcHandlers(ipcMain: import("electron").IpcMain): (() => void) {
  const requireValidSender = (event: import("electron").IpcMainInvokeEvent): void => {
    if (event.sender.isDestroyed()) {
      throw new Error("Veyra overlay IPC request rejected: sender is no longer available.");
    }
  };

  const asObject = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  };

  ipcMain.handle(IPC_CHANNELS.OVERLAY_SHOW, async (_event, raw: unknown) => {
    requireValidSender(_event);
    const input = asObject(raw);
    const sessionId =
      typeof input.sessionId === "string" && input.sessionId.trim()
        ? input.sessionId.trim()
        : undefined;
    showOverlayWindow(sessionId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_HIDE, async (_event) => {
    requireValidSender(_event);
    hideOverlayWindow();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_TOGGLE, async (_event) => {
    requireValidSender(_event);
    toggleOverlayWindow();
    return { success: true, data: getOverlayState() };
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_UPDATE, async (_event, raw: unknown) => {
    requireValidSender(_event);
    const input = asObject(raw);
    if (typeof input.opacity === "number") {
      setOverlayOpacity(input.opacity);
    }
    if (typeof input.alwaysOnTop === "boolean") {
      setOverlayAlwaysOnTop(input.alwaysOnTop);
    }
    if (typeof input.x === "number" && typeof input.y === "number") {
      setOverlayPosition(input.x, input.y);
    }
    if (typeof input.width === "number" && typeof input.height === "number") {
      setOverlaySize(input.width, input.height);
    }
    return { success: true, data: getOverlayState() };
  });

  ipcMain.handle("overlay:get-state", async (_event) => {
    requireValidSender(_event);
    return { success: true, data: getOverlayState() };
  });

  return () => {
    for (const ch of [
      IPC_CHANNELS.OVERLAY_SHOW,
      IPC_CHANNELS.OVERLAY_HIDE,
      IPC_CHANNELS.OVERLAY_TOGGLE,
      IPC_CHANNELS.OVERLAY_UPDATE,
    ]) {
      ipcMain.removeHandler(ch);
    }
    try {
      ipcMain.removeHandler("overlay:get-state");
    } catch {
      // handler may already be removed
    }
  };
}
