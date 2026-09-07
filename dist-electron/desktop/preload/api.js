"use strict";
// desktop/preload/api.ts
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const events_1 = require("@shared/constants/events");
const api = {
    app: {
        getVersion: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.APP_GET_VERSION),
        getPlatform: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.APP_GET_PLATFORM),
    },
    window: {
        minimize: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.WINDOW_MINIMIZE),
        maximize: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.WINDOW_MAXIMIZE),
        close: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.WINDOW_CLOSE),
    },
    audio: {
        listDevices: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.AUDIO_LIST_DEVICES),
        getPermission: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.AUDIO_GET_PERMISSION),
    },
    capture: {
        listSources: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.CAPTURE_LIST_SOURCES),
        getPermission: () => electron_1.ipcRenderer.invoke(events_1.IPC_CHANNELS.CAPTURE_GET_PERMISSION),
    },
};
electron_1.contextBridge.exposeInMainWorld("veyra", api);
//# sourceMappingURL=api.js.map