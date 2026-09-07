// scripts/setup.ts

/**
 * Veyra Project Setup
 *
 * Responsibilities:
 * - Validate the repository root.
 * - Verify basic runtime requirements.
 * - Create required project directories.
 * - Create safe placeholder files where required.
 * - Copy .env.example -> .env only when .env does not exist.
 * - Provide actionable setup output.
 *
 * This script is intentionally idempotent.
 *
 * Run:
 *
 *   npm run setup
 *   npx tsx scripts/setup.ts
 */

/// <reference types="node" />

import {
  access,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(
  fileURLToPath(import.meta.url),
);

const PROJECT_ROOT = path.resolve(
  SCRIPT_DIRECTORY,
  "..",
);

const REQUIRED_DIRECTORIES = [
  "assets",
  "assets/icons",
  "assets/icons/windows",
  "assets/icons/macos",
  "assets/icons/tray",
  "assets/sounds",
  "assets/branding",

  "build",
  "build/entitlements",
  "build/installers",
  "build/installers/windows",
  "build/installers/macos",
  "build/scripts",

  "client",
  "client/public",
  "client/public/images",
  "client/public/images/onboarding",
  "client/public/images/empty-states",
  "client/public/images/marketing",
  "client/public/icons",
  "client/public/icons/status",
  "client/public/fonts",
  "client/public/sounds",

  "client/src",
  "client/src/app",
  "client/src/pages",
  "client/src/features",
  "client/src/components",
  "client/src/hooks",
  "client/src/stores",
  "client/src/services",
  "client/src/services/ipc",
  "client/src/services/storage",
  "client/src/lib",
  "client/src/styles",

  "desktop",
  "desktop/main",
  "desktop/preload",
  "desktop/windows",
  "desktop/ipc",
  "desktop/services",

  "server",
  "server/src",
  "server/src/config",
  "server/src/routes",
  "server/src/controllers",
  "server/src/services",
  "server/src/middleware",
  "server/src/repositories",
  "server/src/utils",
  "server/tests",
  "server/tests/unit",
  "server/tests/integration",
  "server/tests/fixtures",

  "core",
  "core/ai",
  "core/audio",
  "core/conversation",
  "core/context",
  "core/interview",
  "core/vision",
  "core/documents",
  "core/prompts",
  "core/reliability",
  "core/analytics",
  "core/security",

  "database",
  "database/schema",
  "database/migrations",
  "database/repositories",

  "shared",
  "shared/types",
  "shared/contracts",
  "shared/constants",
  "shared/validation",

  "tests",
  "tests/unit",
  "tests/integration",
  "tests/e2e",
  "tests/fixtures",
  "tests/mocks",

  "scripts",
  "docs",
];

const REQUIRED_FILES = [
  "database/migrations/.gitkeep",
  "client/public/fonts/.gitkeep",
  "client/public/sounds/.gitkeep",
];

function log(message: string): void {
  console.log(
    `[setup] ${message}`,
  );
}

function warn(message: string): void {
  console.warn(
    `[setup] WARNING: ${message}`,
  );
}

function fail(message: string): never {
  console.error(
    `[setup] ERROR: ${message}`,
  );

  process.exitCode = 1;

  throw new Error(message);
}

async function pathExists(
  target: string,
): Promise<boolean> {
  try {
    await access(
      target,
      fsConstants.F_OK,
    );

    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(
  relativePath: string,
): Promise<void> {
  const target = path.join(
    PROJECT_ROOT,
    relativePath,
  );

  if (
    await pathExists(target)
  ) {
    return;
  }

  await mkdir(target, {
    recursive: true,
  });

  log(
    `Created directory: ${relativePath}`,
  );
}

async function ensureFile(
  relativePath: string,
): Promise<void> {
  const target = path.join(
    PROJECT_ROOT,
    relativePath,
  );

  if (
    await pathExists(target)
  ) {
    return;
  }

  await writeFile(
    target,
    "",
    "utf8",
  );

  log(
    `Created file: ${relativePath}`,
  );
}

async function ensureEnvironmentFile(): Promise<void> {
  const envPath = path.join(
    PROJECT_ROOT,
    ".env",
  );

  const examplePath = path.join(
    PROJECT_ROOT,
    ".env.example",
  );

  if (
    await pathExists(envPath)
  ) {
    log(
      ".env already exists; leaving it untouched.",
    );

    return;
  }

  if (
    !(await pathExists(examplePath))
  ) {
    warn(
      ".env.example does not exist. Skipping .env creation. " +
        "Create .env manually before running services that require it.",
    );

    return;
  }

  await copyFile(
    examplePath,
    envPath,
  );

  log(
    "Created .env from .env.example.",
  );

  warn(
    "Review .env before starting the application. " +
      "Never commit secrets to source control.",
  );
}

async function verifyPackageManifest(): Promise<void> {
  const packagePath = path.join(
    PROJECT_ROOT,
    "package.json",
  );

  if (
    !(await pathExists(packagePath))
  ) {
    fail(
      "package.json was not found. Run this script from the Veyra repository.",
    );
  }

  try {
    const raw = await readFile(
      packagePath,
      "utf8",
    );

    JSON.parse(raw);
  } catch {
    fail(
      "package.json exists but is not valid JSON.",
    );
  }

  log(
    "package.json is valid.",
  );
}

async function verifyNodeVersion(): Promise<void> {
  const major = Number(
    process.versions.node.split(".")[0],
  );

  if (
    !Number.isInteger(major)
  ) {
    fail(
      `Unable to determine Node.js version: ${process.versions.node}`,
    );
  }

  if (major < 20) {
    fail(
      `Node.js ${process.versions.node} detected. Veyra requires Node.js 20 or newer.`,
    );
  }

  log(
    `Node.js ${process.versions.node} detected.`,
  );
}

async function main(): Promise<void> {
  console.log("");
  console.log("========================================");
  console.log(" Veyra — Project Setup");
  console.log("========================================");
  console.log("");

  await verifyNodeVersion();
  await verifyPackageManifest();

  log(
    "Creating required project directories...",
  );

  for (
    const directory of REQUIRED_DIRECTORIES
  ) {
    await ensureDirectory(
      directory,
    );
  }

  log(
    "Creating required placeholder files...",
  );

  for (
    const file of REQUIRED_FILES
  ) {
    await ensureFile(file);
  }

  await ensureEnvironmentFile();

  console.log("");
  console.log("========================================");
  console.log(" Setup completed successfully");
  console.log("========================================");
  console.log("");

  console.log(
    "Recommended next steps:",
  );
  console.log("  1. npm install");
  console.log("  2. Review .env");
  console.log("  3. npm run check:environment");
  console.log("  4. npm run build");
  console.log("");
}

main().catch((cause: unknown) => {
  const message =
    cause instanceof Error
      ? cause.message
      : String(cause);

  console.error(
    `[setup] ERROR: ${message}`,
  );

  process.exitCode = 1;
});