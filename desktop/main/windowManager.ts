// desktop/main/windowManager.ts

import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;

const isDevelopment = process.env.NODE_ENV === "development";

const rendererUrl = process.env.VEYRA_RENDERER_URL ?? "http://localhost:5173";

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();

    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,

    show: false,

    backgroundColor: "#0b0d10",

    title: "Veyra",

    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: true,

      webSecurity: true,

      allowRunningInsecureContent: false,

      spellcheck: true,
    },
  });

  configureWindow(mainWindow);
  configureExternalNavigation(mainWindow);
  configureWindowLifecycle(mainWindow);

  void loadRenderer(mainWindow);

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  return mainWindow;
}

export function isMainWindowAvailable(): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed());
}

export function focusMainWindow(): void {
  const window = getMainWindow();

  if (!window) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

export function destroyMainWindow(): void {
  const window = getMainWindow();

  if (!window) {
    return;
  }

  window.destroy();
  mainWindow = null;
}

function configureWindow(window: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();

  const workArea = display.workAreaSize;

  const width = Math.min(1440, workArea.width);
  const height = Math.min(920, workArea.height);

  window.setSize(width, height);
  window.center();

  window.on("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });
}

function configureExternalNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return {
      action: "deny",
    };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedRendererUrl(url)) {
      return;
    }

    event.preventDefault();

    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });
}

function configureWindowLifecycle(window: BrowserWindow): void {
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  try {
    if (isDevelopment) {
      await window.loadURL(rendererUrl);

      if (process.env.VEYRA_DEVTOOLS === "true") {
        window.webContents.openDevTools({
          mode: "detach",
        });
      }

      return;
    }

    const indexPath = path.join(__dirname, "../../client/dist/index.html");

    await window.loadFile(indexPath);
  } catch (error) {
    console.error("[Veyra] Failed to load renderer.", error);
  }
}

function isAllowedRendererUrl(url: string): boolean {
  if (isDevelopment) {
    return (
      url.startsWith("http://localhost:5173") ||
      url.startsWith("http://127.0.0.1:5173")
    );
  }

  return url.startsWith("file://");
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
