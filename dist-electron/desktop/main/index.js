"use strict";
// desktop/main/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const events_1 = require("@shared/constants/events");
const windowManager_1 = require("./windowManager");
const isDevelopment = process.env.NODE_ENV === "development";
electron_1.app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");
function registerIPC() {
    electron_1.ipcMain.handle(events_1.IPC_CHANNELS.APP_GET_VERSION, () => electron_1.app.getVersion());
    electron_1.ipcMain.handle(events_1.IPC_CHANNELS.APP_GET_PLATFORM, () => process.platform);
    electron_1.ipcMain.handle(events_1.IPC_CHANNELS.WINDOW_MINIMIZE, () => {
        (0, windowManager_1.getMainWindow)()?.minimize();
    });
    electron_1.ipcMain.handle(events_1.IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
        const window = (0, windowManager_1.getMainWindow)();
        if (!window) {
            return;
        }
        if (window.isMaximized()) {
            window.unmaximize();
        }
        else {
            window.maximize();
        }
    });
    electron_1.ipcMain.handle(events_1.IPC_CHANNELS.WINDOW_CLOSE, () => {
        (0, windowManager_1.getMainWindow)()?.close();
    });
}
async function bootstrap() {
    await electron_1.app.whenReady();
    electron_1.app.setAppUserModelId("com.veyra.desktop");
    registerIPC();
    (0, windowManager_1.createMainWindow)();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            (0, windowManager_1.createMainWindow)();
        }
    });
}
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
        if (isDevelopment && navigationUrl.startsWith("http://127.0.0.1:5173")) {
            return;
        }
        event.preventDefault();
    });
});
void bootstrap();
//# sourceMappingURL=index.js.map