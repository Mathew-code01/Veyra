import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export function prepareElectronRuntime(
  projectRoot = resolve(scriptDirectory, ".."),
) {
  const outputDirectory = resolve(projectRoot, "dist-electron");
  const mainDirectory = resolve(outputDirectory, "desktop", "main");
  const compiledMain = resolve(mainDirectory, "index.js");

  if (!existsSync(compiledMain)) {
    throw new Error(
      `Compiled Electron main entry does not exist: ${compiledMain}`,
    );
  }

  writeFileSync(
    resolve(outputDirectory, "package.json"),
    `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(mainDirectory, "index.cjs"),
    'require("./index.js");\n',
    "utf8",
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  prepareElectronRuntime(
    process.argv[2] ? resolve(process.argv[2]) : undefined,
  );
}
