export type CaptureSourceType = "screen" | "window" | "display";
export interface CaptureSource {
    id: string;
    name: string;
    type: CaptureSourceType;
    thumbnailDataUrl?: string;
}
export interface CapturePermissionState {
    screen: "granted" | "denied" | "prompt" | "unknown";
}
export interface CaptureSessionState {
    active: boolean;
    sourceId: string | null;
    startedAt: string | null;
}
