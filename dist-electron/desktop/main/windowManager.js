"use strict";
// desktop/main/windowManager.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMainWindow = createMainWindow;
exports.getMainWindow = getMainWindow;
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const __filename = (0, node_url_1.fileURLToPath)(import.meta.url);
const __dirname = node_path_1.default.dirname(__filename);
let mainWindow = null;
function getPreloadPath() {
    return node_path_1.default.join(__dirname, "../preload/index.js");
}
function createMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        return mainWindow;
    }
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1100,
        minHeight: 700,
        show: false,
        backgroundColor: "#09090b",
        title: "Veyra",
        webPreferences: {
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
    });
    mainWindow.once("ready-to-show", () => {
        mainWindow?.show();
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void electron_1.shell.openExternal(url);
        return {
            action: "deny",
        };
    });
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    if (process.env.NODE_ENV === "development") {
        void mainWindow.loadURL("http://127.0.0.1:5173");
    }
    else {
        void mainWindow.loadFile(node_path_1.default.join(__dirname, "../../dist/index.html"));
    }
    return mainWindow;
}
function getMainWindow() {
    return mainWindow;
}
//# sourceMappingURL=windowManager.js.map