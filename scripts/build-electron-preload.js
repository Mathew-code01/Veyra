import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export async function buildElectronPreload(
  projectRoot = resolve(scriptDirectory, ".."),
) {
  await build({
    configFile: false,
    envDir: false,
    logLevel: "info",
    root: projectRoot,
    build: {
      lib: {
        entry: resolve(projectRoot, "desktop", "preload", "index.ts"),
        formats: ["cjs"],
        fileName: () => "index.js",
      },
      outDir: resolve(projectRoot, "dist-electron", "desktop", "preload"),
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        external: ["electron"],
      },
    },
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await buildElectronPreload(
    process.argv[2] ? resolve(process.argv[2]) : undefined,
  );
}
