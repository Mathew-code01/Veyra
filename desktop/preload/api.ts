// Relative path: desktop/preload/api.ts

/**
 * Veyra Secure Preload API
 *
 * SECURITY MODEL
 * ─────────────────────────────────────────────────────────────
 *
 * Renderer
 *    ↓
 * window.veyra
 *    ↓
 * preload
 *    ↓
 * ipcRenderer.invoke(...)
 *    ↓
 * Electron main process
 *
 * The renderer never receives:
 *
 * - ipcRenderer
 * - Node.js process
 * - fs
 * - path
 * - child_process
 * - systeminformation
 * - HardwareProfiler
 * - ModelManager
 * - Electron internals
 *
 * Only explicitly approved IPC operations are exposed.
 */

import { ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import {
  HARDWARE_IPC_CHANNELS,
  type HardwareGetModelPlanRequest,
  type HardwareGetProfileRequest,
} from "../../shared/contracts/hardware.contract";

import type {
  HardwareModelPlanResponse,
  HardwareSnapshotResponse,
} from "../../shared/types/hardware";

import type { VeyraDesktopAPI, WindowOperationResult } from "./types";

/**
 * Generic request shape accepted by the hardware API.
 */
type HardwareRequest = {
  readonly forceRefresh?: boolean;
};

/**
 * Normalizes hardware requests before sending them
 * across the Electron IPC boundary.
 */
function normalizeHardwareRequest(
  request: HardwareRequest | undefined,
): HardwareGetProfileRequest | undefined {
  if (!request) {
    return undefined;
  }

  return Object.freeze({
    forceRefresh: request.forceRefresh === true,
  });
}

/**
 * Normalizes model-plan requests.
 */
function normalizeModelPlanRequest(
  request: HardwareRequest | undefined,
): HardwareGetModelPlanRequest | undefined {
  if (!request) {
    return undefined;
  }

  return Object.freeze({
    forceRefresh: request.forceRefresh === true,
  });
}

/**
 * Hardware API.
 *
 * Only whitelisted IPC channels are exposed.
 */
const hardwareApi: VeyraDesktopAPI["hardware"] = Object.freeze({
  getProfile: async (
    request: HardwareRequest | undefined,
  ): Promise<HardwareSnapshotResponse> => {
    const normalized = normalizeHardwareRequest(request);

    return ipcRenderer.invoke(
      HARDWARE_IPC_CHANNELS.GET_PROFILE,
      normalized,
    ) as Promise<HardwareSnapshotResponse>;
  },

  refreshProfile: async (): Promise<HardwareSnapshotResponse> => {
    return ipcRenderer.invoke(
      HARDWARE_IPC_CHANNELS.REFRESH_PROFILE,
    ) as Promise<HardwareSnapshotResponse>;
  },

  getModelPlan: async (
    request: HardwareRequest | undefined,
  ): Promise<HardwareModelPlanResponse> => {
    const normalized = normalizeModelPlanRequest(request);

    return ipcRenderer.invoke(
      HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN,
      normalized,
    ) as Promise<HardwareModelPlanResponse>;
  },
});

/**
 * Complete renderer-facing API.
 *
 * IMPORTANT:
 *
 * Do not expose ipcRenderer itself.
 */
export const api: VeyraDesktopAPI = Object.freeze({
  app: Object.freeze({
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION) as Promise<string>,

    getPlatform: (): Promise<NodeJS.Platform> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.APP_GET_PLATFORM,
      ) as Promise<NodeJS.Platform>,

    getEnvironment: (): Promise<"development" | "production"> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_ENVIRONMENT) as Promise<
        "development" | "production"
      >,
  }),

  window: Object.freeze({
    minimize: (): Promise<WindowOperationResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_MINIMIZE,
      ) as Promise<WindowOperationResult>,

    maximize: (): Promise<WindowOperationResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_MAXIMIZE,
      ) as Promise<WindowOperationResult>,

    close: (): Promise<WindowOperationResult> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.WINDOW_CLOSE,
      ) as Promise<WindowOperationResult>,

    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED) as Promise<boolean>,

    isAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_AVAILABLE) as Promise<boolean>,
  }),

  hardware: hardwareApi,
});
