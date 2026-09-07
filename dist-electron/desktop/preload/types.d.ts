import type { AudioDevice, AudioPermissionState } from "@shared/types/audio";
import type { CapturePermissionState, CaptureSource } from "@shared/types/capture";
export interface VeyraAPI {
    app: {
        getVersion(): Promise<string>;
        getPlatform(): Promise<NodeJS.Platform>;
    };
    window: {
        minimize(): Promise<void>;
        maximize(): Promise<void>;
        close(): Promise<void>;
    };
    audio: {
        listDevices(): Promise<AudioDevice[]>;
        getPermission(): Promise<AudioPermissionState>;
    };
    capture: {
        listSources(): Promise<CaptureSource[]>;
        getPermission(): Promise<CapturePermissionState>;
    };
}
declare global {
    interface Window {
        veyra: VeyraAPI;
    }
}
