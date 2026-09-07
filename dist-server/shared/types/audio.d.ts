export type AudioDeviceType = "input" | "output";
export interface AudioDevice {
    id: string;
    label: string;
    type: AudioDeviceType;
    isDefault: boolean;
}
export interface AudioPermissionState {
    microphone: "granted" | "denied" | "prompt" | "unknown";
}
export interface AudioSessionState {
    active: boolean;
    deviceId: string | null;
    startedAt: string | null;
    sampleRate: number;
    channels: number;
}
