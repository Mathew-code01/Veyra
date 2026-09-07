// shared/types/capture.ts

import type { ISODateString } from "./common";

export type CaptureSourceType = "screen" | "window" | "display";

export interface CaptureSource {
  readonly id: string;
  readonly name: string;
  readonly type: CaptureSourceType;

  readonly thumbnailDataUrl?: string;

  readonly displayId?: string;
  readonly appIconDataUrl?: string;
}

export type CapturePermissionState =
  "granted" | "denied" | "prompt" | "unknown";

export interface CapturePermission {
  readonly screen: CapturePermissionState;
}

export interface CaptureSessionState {
  readonly active: boolean;
  readonly sourceId: string | null;
  readonly startedAt: ISODateString | null;

  readonly frameRate: number;
  readonly frameCount: number;
}