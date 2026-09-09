// core/models/installation/DownloadState.ts

export type DownloadState =
  | "queued"
  | "preparing"
  | "downloading"
  | "verifying"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadQueueItem {
  readonly id: string;

  readonly modelId: string;

  readonly destinationDirectory: string;

  readonly state: DownloadState;

  readonly bytesDownloaded: number;

  readonly totalBytes: number | null;

  readonly percentage: number | null;

  readonly speedBytesPerSecond: number;

  readonly resumed: boolean;

  readonly priority: number;

  readonly queuedAt: number;

  readonly startedAt: number | null;

  readonly completedAt: number | null;

  readonly error: string | null;
}

export function isTerminalDownloadState(state: DownloadState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}
