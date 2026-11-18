import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script through npm so its npm CLI is available.");
const env = {
  ...process.env,
  NODE_ENV: "development",
  VEYRA_RENDERER_URL: "http://127.0.0.1:5174",
};
// Some Node toolchains set this globally; Electron then starts in Node-only
// mode and `require("electron").app` is undefined in the main process.
delete env.ELECTRON_RUN_AS_NODE;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

await run(process.execPath, [npmCli, "run", "build:electron"]);

let vite;
try {
  await fetch("http://127.0.0.1:5174", { signal: AbortSignal.timeout(4000) });
  console.log("Using the existing Veyra renderer on 127.0.0.1:5174.");
} catch {
  try {
    await fetch("http://localhost:5174", { signal: AbortSignal.timeout(4000) });
    console.log("Using the existing Veyra renderer on localhost:5174.");
  } catch {
    vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (vite.exitCode !== null) throw new Error("Vite exited before becoming ready.");
      try {
        const response = await fetch("http://127.0.0.1:5174", {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        await delay(500);
      }
    }
    if (!ready) throw new Error("Vite did not become ready on port 5174.");
  }
}

const electron = spawn(process.execPath, ["node_modules/electron/cli.js", "."], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: false,
});
const shutdown = () => {
  if (electron.exitCode === null) electron.kill();
  if (vite && vite.exitCode === null) vite.kill();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
electron.once("exit", (code) => {
  if (vite && vite.exitCode === null) vite.kill();
  process.exitCode = code ?? 1;
});
