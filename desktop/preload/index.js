// Relative path: desktop/preload/index.js
//
// Veyra Preload Entry Point
//
// Exposes the Veyra Platform API to the renderer via contextBridge.
// The renderer can only access window.veyra and nothing else from Electron
// or Node.js.
//
// SECURITY MODEL
// --------------
// contextIsolation MUST be true.
// nodeIntegration MUST be false.
// The renderer receives only window.veyra, never ipcRenderer or Electron internals.

import { contextBridge, ipcRenderer } from "electron";

const HARDWARE_IPC_CHANNELS = Object.freeze({
  GET_PROFILE: "veyra:hardware:get-profile",
  REFRESH_PROFILE: "veyra:hardware:refresh-profile",
  GET_MODEL_PLAN: "veyra:hardware:get-model-plan",
  GET_ASSESSMENT: "veyra:hardware:get-assessment",
  INSTALL_MODEL: "veyra:hardware:install-model",
  UNINSTALL_MODEL: "veyra:hardware:uninstall-model",
  CANCEL_INSTALL: "veyra:hardware:cancel-install",
  INSTALL_PROGRESS: "veyra:hardware:install-progress",
});

if (!process.contextIsolated) {
  throw new Error("Veyra requires Electron contextIsolation to be enabled.");
}

/**
 * Hardware API exposed to the renderer.
 *
 * All IPC calls go through the main process. The renderer never touches
 * Electron internals or node modules directly.
 */
const hardwareApi = Object.freeze({
  getProfile: async (request) => {
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.GET_PROFILE, request);
  },

  refreshProfile: async () => {
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.REFRESH_PROFILE);
  },

  getModelPlan: async (request) => {
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN, request);
  },

  getAssessment: async (request) => {
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.GET_ASSESSMENT, request);
  },

  installModel: async (modelId) => {
    if (typeof modelId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(modelId)) {
      throw new Error("Invalid model selection.");
    }
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.INSTALL_MODEL, { modelId });
  },

  uninstallModel: async (modelId) => {
    if (typeof modelId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(modelId)) {
      throw new Error("Invalid model selection.");
    }
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.UNINSTALL_MODEL, { modelId });
  },

  cancelInstall: async (modelId) => {
    return ipcRenderer.invoke(HARDWARE_IPC_CHANNELS.CANCEL_INSTALL, { modelId });
  },

  onInstallProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on(HARDWARE_IPC_CHANNELS.INSTALL_PROGRESS, listener);
    return () => ipcRenderer.removeListener(HARDWARE_IPC_CHANNELS.INSTALL_PROGRESS, listener);
  },
});

contextBridge.exposeInMainWorld("veyra", Object.freeze({
  hardware: hardwareApi,
}));
