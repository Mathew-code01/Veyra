// ============================================================================
// FILE: shared/contracts/updater.contract.ts
//
// PURPOSE:
// Canonical IPC contract for the VEYRA desktop automatic updater.
// These types define the request/response shapes for updater operations.
// ============================================================================

import type { UpdaterCheckResult, UpdaterStatus, UpdateChannel } from "../types/updater";

export const UPDATER_IPC_CHANNELS = Object.freeze({
  CHECK_FOR_UPDATES: "updater:check",
  DOWNLOAD_UPDATE: "updater:download",
  INSTALL_UPDATE: "updater:install",
  GET_STATUS: "updater:get-status",
  SET_CHANNEL: "updater:set-channel",
  SET_AUTO_CHECK: "updater:set-auto-check",
  ON_DOWNLOAD_PROGRESS: "updater:progress",
  ON_STATE_CHANGE: "updater:state-change",
} as const);

export type UpdaterIpcChannel = (typeof UPDATER_IPC_CHANNELS)[keyof typeof UPDATER_IPC_CHANNELS];

export interface UpdaterCheckRequest {
  readonly force?: boolean;
}

export type UpdaterCheckRequestOrUndefined = UpdaterCheckRequest | undefined;

export interface UpdaterDownloadRequest {
  readonly version?: string;
}

export interface UpdaterInstallRequest {
  readonly restartNow?: boolean;
}

export interface UpdaterSetChannelRequest {
  readonly channel: UpdateChannel;
}

export interface UpdaterSetAutoCheckRequest {
  readonly enabled: boolean;
}

export interface UpdaterProgressPayload {
  readonly percent: number;
  readonly bytesDownloaded: number;
  readonly totalBytes: number;
  readonly speedBytesPerSecond: number;
  readonly phase: "downloading" | "verifying" | "installing";
}

export interface UpdaterStateChangePayload {
  readonly state: "idle" | "checking" | "downloading" | "downloaded" | "installing" | "installed" | "error";
  readonly latestVersion?: string;
  readonly error?: string;
}