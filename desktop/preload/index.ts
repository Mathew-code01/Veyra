// desktop/preload/index.ts

import { contextBridge } from "electron";

import { api } from "./api";

if (typeof contextBridge.exposeInMainWorld === "function") {
  contextBridge.exposeInMainWorld("veyra", api);
}
