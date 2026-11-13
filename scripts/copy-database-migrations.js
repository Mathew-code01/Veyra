import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export function copyDatabaseMigrations(
  projectRoot = resolve(scriptDirectory, ".."),
) {
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
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  copyDatabaseMigrations(
    process.argv[2] ? resolve(process.argv[2]) : undefined,
  );
}
