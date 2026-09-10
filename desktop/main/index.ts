// desktop/main/index.ts

import { app, BrowserWindow, ipcMain } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import { initializeApplication, shutdownApplication } from "./appLifecycle";

import {
  createMainWindow,
  getMainWindow,
  isMainWindowAvailable,
} from "./windowManager";

const isDevelopment = process.env.NODE_ENV === "development" && !app.isPackaged;

let ipcRegistered = false;
let shuttingDown = false;

function registerIPC(): void {
  if (ipcRegistered) {
    return;
  }

  ipcRegistered = true;

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM, () => {
    return process.platform;
  });

  ipcMain.handle(IPC_CHANNELS.APP_GET_ENVIRONMENT, () => {
    return isDevelopment ? "development" : "production";
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    const window = getMainWindow();

    if (!window || window.isDestroyed()) {
      return {
        success: false,
        reason: "window-unavailable",
      };
    }

    window.minimize();

    return {
      success: true,
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    const window = getMainWindow();

    if (!window || window.isDestroyed()) {
      return {
        success: false,
        reason: "window-unavailable",
      };
    }

    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }

    return {
      success: true,
      maximized: window.isMaximized(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    const window = getMainWindow();

    if (!window || window.isDestroyed()) {
      return {
        success: false,
        reason: "window-unavailable",
      };
    }

    window.close();

    return {
      success: true,
    };
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    const window = getMainWindow();

    if (!window || window.isDestroyed()) {
      return false;
    }

    return window.isMaximized();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_AVAILABLE, () => {
    return isMainWindowAvailable();
  });
}

function registerSecurityHandlers(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
      if (isDevelopment) {
        const developmentOrigins = [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ];

        if (
          developmentOrigins.some((origin) => navigationUrl.startsWith(origin))
        ) {
          return;
        }
      }

      event.preventDefault();
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://") && isDevelopment) {
        return {
          action: "allow",
        };
      }

      return {
        action: "deny",
      };
    });
  });
}

function registerApplicationEvents(): void {
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.on("before-quit", (event) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    event.preventDefault();

    void shutdownApplication().finally(() => {
      app.exit(0);
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

async function bootstrap(): Promise<void> {
  try {
    await app.whenReady();

    app.setAppUserModelId("com.veyra.desktop");

    await initializeApplication();

    registerIPC();
    registerSecurityHandlers();
    registerApplicationEvents();

    createMainWindow();
  } catch (error) {
    console.error("[Veyra] Failed to bootstrap application.", error);

    app.exit(1);
  }
}

void bootstrap();
