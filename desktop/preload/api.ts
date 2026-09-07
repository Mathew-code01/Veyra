// desktop/preload/api.ts

import { ipcRenderer } from "electron";

import { IPC_CHANNELS } from "@shared/constants/events";

import type { VeyraDesktopAPI } from "./types";

export const api: VeyraDesktopAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),

    getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PLATFORM),

    getEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_ENVIRONMENT),
  },

  window: {
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),

    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),

    close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),

    isAvailable: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_AVAILABLE),
  },
};
