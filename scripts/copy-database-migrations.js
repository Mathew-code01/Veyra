import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const source = resolve(projectRoot, "database", "migrations");
const destination = resolve(
  projectRoot,
  "dist-electron",
  "database",
  "migrations",
);

if (!existsSync(source)) {
  throw new Error(`Database migrations directory does not exist: ${source}`);
}

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
