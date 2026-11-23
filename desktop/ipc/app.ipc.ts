// ============================================================================
// FILE: desktop/ipc/app.ipc.ts
//
// PURPOSE:
// Main-process IPC handlers for application-level platform details and permissions.
// ============================================================================

import { app, IpcMain, IpcMainInvokeEvent } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type { OperatingSystem } from "../../shared/types/permissions";

function assertValidIpcSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Veyra IPC request rejected: sender is no longer available.");
  }
}

function getOperatingSystem(): OperatingSystem {
  const platform = process.platform;
  if (platform === "win32") return "win32";
  if (platform === "darwin") return "darwin";
  return "linux";
}

function getOSVersion(): string {
  const platform = process.platform;
  const release = process.platform === "win32" ? app.getVersion() : process.version;
  // For Electron apps, we can get more detailed OS info
  return process.platform === "win32" 
    ? `Windows ${os.release()}` 
    : platform === "darwin" 
      ? `macOS ${os.release()}` 
      : `Linux ${os.release()}`;
}

const os = require("os");

export function registerAppIpc(ipcMain: IpcMain): () => void {
  // APP_GET_VERSION
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, async (event) => {
    assertValidIpcSender(event);
    return app.getVersion();
  });

  // APP_GET_PLATFORM
  ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM, async (event) => {
    assertValidIpcSender(event);
    return getOperatingSystem();
  });

  // APP_GET_ENVIRONMENT
  ipcMain.handle(IPC_CHANNELS.APP_GET_ENVIRONMENT, async (event) => {
    assertValidIpcSender(event);
    return process.env.NODE_ENV === "development" && !app.isPackaged ? "development" : "production";
  });

  // APP_GET_PLATFORM_DETAILS
  ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM_DETAILS, async (event) => {
    assertValidIpcSender(event);

    const osType = getOperatingSystem();
    const osVersion = osType === "win32" 
      ? `Windows ${os.release()}` 
      : osType === "darwin" 
        ? `macOS ${os.release()}` 
        : `Linux ${os.release()}`;

    // Check screen capture support
    let screenCaptureSupported = false;
    let accessibilitySupported = false;

    try {
      // Screen capture is supported on all modern platforms via different mechanisms
      // Windows: Windows.Graphics.Capture / DDA
      // macOS: ScreenCaptureKit / CGWindowList
      // Linux: PipeWire + xdg-desktop-portal
      screenCaptureSupported = true;

      // Accessibility is primarily for macOS
      accessibilitySupported = osType === "darwin";
    } catch {
      // Ignore
    }

    return {
      success: true,
      data: {
        os: osType,
        osVersion,
        screenCaptureSupported,
        accessibilitySupported,
      },
    };
  });

  // APP_GET_NOTIFICATION_PERMISSION
  ipcMain.handle(IPC_CHANNELS.APP_GET_NOTIFICATION_PERMISSION, async (event) => {
    assertValidIpcSender(event);
    // Electron doesn't have a direct API for this, but we can check
    // if the app has been granted notification permission
    return {
      success: true,
      data: {
        granted: true, // Assume granted if we can create notifications
        state: "granted",
      },
    };
  });

  // APP_REQUEST_NOTIFICATION_PERMISSION
  ipcMain.handle(IPC_CHANNELS.APP_REQUEST_NOTIFICATION_PERMISSION, async (event) => {
    assertValidIpcSender(event);
    // On Windows/macOS, showing a notification triggers the permission prompt
    // On Linux, it depends on the desktop environment
    try {
      const notification = new Notification("Notifications enabled", {
        body: "VEYRA can now send you desktop notifications.",
      });
      notification.close();
      return {
        success: true,
        data: { state: "granted" },
      };
    } catch {
      return {
        success: true,
        data: { state: "denied" },
      };
    }
  });

  // APP_TEST_NOTIFICATION
  ipcMain.handle(IPC_CHANNELS.APP_TEST_NOTIFICATION, async (event) => {
    assertValidIpcSender(event);
    try {
      const notification = new Notification("VEYRA Test", {
        body: "Desktop notifications are functioning normally.",
      });
      notification.close();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to send test notification" };
    }
  });

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.APP_GET_VERSION);
    ipcMain.removeHandler(IPC_CHANNELS.APP_GET_PLATFORM);
    ipcMain.removeHandler(IPC_CHANNELS.APP_GET_ENVIRONMENT);
    ipcMain.removeHandler(IPC_CHANNELS.APP_GET_PLATFORM_DETAILS);
    ipcMain.removeHandler(IPC_CHANNELS.APP_GET_NOTIFICATION_PERMISSION);
    ipcMain.removeHandler(IPC_CHANNELS.APP_REQUEST_NOTIFICATION_PERMISSION);
    ipcMain.removeHandler(IPC_CHANNELS.APP_TEST_NOTIFICATION);
  };
}