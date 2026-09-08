// Relative path: desktop/preload/index.ts

/**
 * Veyra Preload Entry Point
 *
 * SECURITY REQUIREMENTS
 * ─────────────────────────────────────────────────────────────
 *
 * contextIsolation MUST be enabled.
 *
 * nodeIntegration MUST be disabled.
 *
 * The renderer receives only window.veyra.
 */

import { contextBridge } from "electron";

import { api } from "./api";

if (!process.contextIsolated) {
  throw new Error("Veyra requires Electron contextIsolation to be enabled.");
}

contextBridge.exposeInMainWorld("veyra", api);
