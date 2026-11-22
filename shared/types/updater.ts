// ============================================================================
// FILE: shared/types/updater.ts
//
// PURPOSE:
// Shared type definitions for the VEYRA desktop automatic updater.
// These types are used across the main process, preload, and renderer.
// ============================================================================

/**
 * Update check response from the main process.
 */
export interface UpdaterCheckResult {
  readonly success: boolean;
  readonly data?: {
    readonly hasUpdate: boolean;
    readonly latestVersion: string;
    readonly currentVersion: string;
    readonly releaseNotes?: string;
    readonly releaseDate?: string;
    readonly downloadUrl?: string;
    readonly sizeBytes?: number;
    readonly sha256?: string;
  };
  readonly error?: string;
}

/**
 * Update download progress event.
 */
export interface UpdaterProgressEvent {
  readonly percent: number;
  readonly bytesDownloaded: number;
  readonly totalBytes: number;
  readonly speedBytesPerSecond: number;
  readonly phase: "downloading" | "verifying" | "installing";
}

/**
 * Update status snapshot.
 */
export interface UpdaterStatus {
  readonly state:
    | "idle"
    | "checking"
    | "downloading"
    | "downloaded"
    | "installing"
    | "installed"
    | "error";
  readonly currentVersion: string;
  readonly latestVersion?: string;
  readonly channel: "stable" | "beta";
  readonly autoCheck: boolean;
  readonly lastChecked?: string;
  readonly error?: string;
  readonly progress?: UpdaterProgressEvent;
}

/**
 * Update channel.
 */
export type UpdateChannel = "stable" | "beta";

/**
 * Updater configuration stored in user preferences.
 */
export interface UpdaterConfig {
  readonly channel: UpdateChannel;
  readonly autoCheck: boolean;
  readonly autoDownload: boolean;
  readonly notifyOnUpdate: boolean;
}