// ============================================================================
// FILE: desktop/ipc/updater.ipc.ts
//
// PURPOSE:
// Main-process IPC handlers for the VEYRA desktop automatic updater.
// Uses electron-updater for cross-platform update management.
// ============================================================================

import { autoUpdater, UpdateInfo, ProgressInfo } from "electron-updater";
import { ipcMain, IpcMain, IpcMainInvokeEvent, app, BrowserWindow } from "electron";

import { UPDATER_IPC_CHANNELS, type UpdaterCheckRequest, type UpdaterDownloadRequest, type UpdaterInstallRequest, type UpdaterSetChannelRequest, type UpdaterSetAutoCheckRequest, type UpdaterProgressPayload, type UpdaterStateChangePayload } from "../../shared/contracts/updater.contract";
import type { UpdaterStatus, UpdateChannel, UpdaterCheckResult } from "../../shared/types/updater";

const CURRENT_VERSION = app.getVersion();

interface UpdaterState {
  state: UpdaterStatus["state"];
  latestVersion?: string;
  error?: string;
  progress?: UpdaterProgressPayload;
  channel: UpdateChannel;
  autoCheck: boolean;
  autoDownload: boolean;
  notifyOnUpdate: boolean;
  lastChecked?: string;
}

export interface RegisterUpdaterIpcOptions {
  readonly mainWindow?: BrowserWindow | null;
  readonly ipcMain?: IpcMain;
}

function assertValidIpcSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Veyra Updater IPC request rejected: sender is no longer available.");
  }
}

function assertRequestObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function broadcastState(mainWindow: BrowserWindow | null, state: UpdaterState): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const status: UpdaterStatus = {
    state: state.state,
    currentVersion: CURRENT_VERSION,
    latestVersion: state.latestVersion,
    channel: state.channel,
    autoCheck: state.autoCheck,
    lastChecked: state.lastChecked,
    error: state.error,
    progress: state.progress,
  };

  mainWindow.webContents.send(UPDATER_IPC_CHANNELS.ON_STATE_CHANGE, status);
}

function broadcastProgress(mainWindow: BrowserWindow | null, progress: UpdaterProgressPayload): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.send(UPDATER_IPC_CHANNELS.ON_DOWNLOAD_PROGRESS, progress);
}

export function registerUpdaterIpc(options: RegisterUpdaterIpcOptions = {}): () => void {
  const mainWindow = options.mainWindow ?? null;
  const main = options.ipcMain ?? ipcMain;

  let state: UpdaterState = {
    state: "idle",
    channel: "stable",
    autoCheck: true,
    autoDownload: true,
    notifyOnUpdate: true,
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = state.channel === "beta";
  autoUpdater.logger = {
    info: (msg) => console.info("[Updater]", msg),
    warn: (msg) => console.warn("[Updater]", msg),
    error: (msg) => console.error("[Updater]", msg),
  };

  const handleCheckForUpdates = async (event: IpcMainInvokeEvent, request?: UpdaterCheckRequest): Promise<UpdaterCheckResult> => {
    assertValidIpcSender(event);

    if (state.state === "checking" || state.state === "downloading") {
      return { success: false, error: "Update check already in progress." };
    }

    state.state = "checking";
    state.error = undefined;
    broadcastState(mainWindow, state);

    try {
      const result = await autoUpdater.checkForUpdates();

      if (result && result.updateInfo) {
        state.state = "downloaded";
        state.latestVersion = result.updateInfo.version;
        state.lastChecked = new Date().toISOString();
        broadcastState(mainWindow, state);

        return {
          success: true,
          data: {
            hasUpdate: true,
            latestVersion: result.updateInfo.version,
            currentVersion: CURRENT_VERSION,
            releaseNotes: typeof result.updateInfo.releaseNotes === "string" ? result.updateInfo.releaseNotes : undefined,
            releaseDate: result.updateInfo.releaseDate,
            downloadUrl: result.updateInfo.files?.[0]?.url,
            sizeBytes: result.updateInfo.files?.[0]?.size,
          },
        };
      } else {
        state.state = "idle";
        state.latestVersion = undefined;
        state.lastChecked = new Date().toISOString();
        broadcastState(mainWindow, state);

        return {
          success: true,
          data: {
            hasUpdate: false,
            latestVersion: CURRENT_VERSION,
            currentVersion: CURRENT_VERSION,
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown update check error";
      state.state = "error";
      state.error = errorMessage;
      broadcastState(mainWindow, state);

      return { success: false, error: errorMessage };
    }
  };

  const handleDownloadUpdate = async (event: IpcMainInvokeEvent, _request?: UpdaterDownloadRequest): Promise<{ readonly success: boolean; readonly error?: string }> => {
    assertValidIpcSender(event);

    if (!state.latestVersion) {
      return { success: false, error: "No update available to download. Check for updates first." };
    }

    if (state.state === "downloading" || state.state === "installing") {
      return { success: false, error: "Update operation already in progress." };
    }

    if (state.state !== "downloaded") {
      return { success: false, error: "No downloaded update ready. Check for updates first." };
    }

    state.state = "downloading";
    state.error = undefined;
    broadcastState(mainWindow, state);

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      const payload: UpdaterProgressPayload = {
        percent: Math.round((progress.bytesPerSecond > 0 ? (progress.transferred / progress.total) * 100 : 0)),
        bytesDownloaded: progress.transferred,
        totalBytes: progress.total,
        speedBytesPerSecond: progress.bytesPerSecond,
        phase: "downloading",
      };
      state.progress = payload;
      broadcastProgress(mainWindow, payload);
    });

    try {
      await autoUpdater.downloadUpdate();

      state.state = "downloaded";
      state.progress = { percent: 100, bytesDownloaded: 0, totalBytes: 0, speedBytesPerSecond: 0, phase: "verifying" };
      broadcastState(mainWindow, state);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown download error";
      state.state = "error";
      state.error = errorMessage;
      broadcastState(mainWindow, state);
      return { success: false, error: errorMessage };
    } finally {
      autoUpdater.removeAllListeners("download-progress");
    }
  };

  const handleInstallUpdate = async (event: IpcMainInvokeEvent, request?: UpdaterInstallRequest): Promise<{ readonly success: boolean; readonly error?: string }> => {
    assertValidIpcSender(event);

    if (state.state !== "downloaded") {
      return { success: false, error: "No downloaded update ready to install." };
    }

    state.state = "installing";
    broadcastState(mainWindow, state);

    try {
      const restartNow = request?.restartNow ?? true;
      autoUpdater.quitAndInstall(restartNow, restartNow);
      state.state = "installed";
      broadcastState(mainWindow, state);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown install error";
      state.state = "error";
      state.error = errorMessage;
      broadcastState(mainWindow, state);
      return { success: false, error: errorMessage };
    }
  };

  const handleGetStatus = async (): Promise<UpdaterStatus> => {
    return {
      state: state.state,
      currentVersion: CURRENT_VERSION,
      latestVersion: state.latestVersion,
      channel: state.channel,
      autoCheck: state.autoCheck,
      lastChecked: state.lastChecked,
      error: state.error,
      progress: state.progress,
    };
  };

  const handleSetChannel = async (event: IpcMainInvokeEvent, request: UpdaterSetChannelRequest): Promise<{ readonly success: boolean; readonly error?: string }> => {
    assertValidIpcSender(event);

    if (request.channel !== "stable" && request.channel !== "beta") {
      return { success: false, error: "Invalid channel. Use 'stable' or 'beta'." };
    }

    state.channel = request.channel;
    autoUpdater.allowPrerelease = request.channel === "beta";

    if (mainWindow) {
      broadcastState(mainWindow, state);
    }

    return { success: true };
  };

  const handleSetAutoCheck = async (event: IpcMainInvokeEvent, request: UpdaterSetAutoCheckRequest): Promise<{ readonly success: boolean; readonly error?: string }> => {
    assertValidIpcSender(event);

    state.autoCheck = request.enabled === true;

    if (mainWindow) {
      broadcastState(mainWindow, state);
    }

    return { success: true };
  };

  main.handle(UPDATER_IPC_CHANNELS.CHECK_FOR_UPDATES, handleCheckForUpdates);
  main.handle(UPDATER_IPC_CHANNELS.DOWNLOAD_UPDATE, handleDownloadUpdate);
  main.handle(UPDATER_IPC_CHANNELS.INSTALL_UPDATE, handleInstallUpdate);
  main.handle(UPDATER_IPC_CHANNELS.GET_STATUS, handleGetStatus);
  main.handle(UPDATER_IPC_CHANNELS.SET_CHANNEL, handleSetChannel);
  main.handle(UPDATER_IPC_CHANNELS.SET_AUTO_CHECK, handleSetAutoCheck);

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    state.state = "downloaded";
    state.latestVersion = info.version;
    broadcastState(mainWindow, state);
  });

  autoUpdater.on("error", (error: Error) => {
    if (state.state !== "downloading" && state.state !== "installing") {
      state.state = "error";
      state.error = error.message;
      broadcastState(mainWindow, state);
    }
  });

  return () => {
    main.removeHandler(UPDATER_IPC_CHANNELS.CHECK_FOR_UPDATES);
    main.removeHandler(UPDATER_IPC_CHANNELS.DOWNLOAD_UPDATE);
    main.removeHandler(UPDATER_IPC_CHANNELS.INSTALL_UPDATE);
    main.removeHandler(UPDATER_IPC_CHANNELS.GET_STATUS);
    main.removeHandler(UPDATER_IPC_CHANNELS.SET_CHANNEL);
    main.removeHandler(UPDATER_IPC_CHANNELS.SET_AUTO_CHECK);
    autoUpdater.removeAllListeners();
  };
}