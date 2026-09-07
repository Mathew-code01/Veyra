// scripts/clean.ts



/**
 * Veyra Clean Script
 *
 * Removes generated development/build artifacts.
 *
 * Safe by default:
 * - never deletes .env
 * - never deletes source files
 * - never deletes database files
 * - never deletes .git
 *
 * Usage:
 *
 *   npm run clean
 *
 * Deep clean:
 *
 *   npm run clean -- --deep
 *
 * Deep clean additionally removes node_modules and package-lock.json
 * only when explicitly requested.
 */

/// <reference types="node" />

import {
  lstat,
  rm,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

const SAFE_TARGETS = [
  "dist",
  "build/out",
  "build/release",
  "coverage",
  ".vite",
  ".turbo",
  "client/dist",
  "server/dist",
  "desktop/dist",
  "core/dist",
  "database/dist",
  "shared/dist",
];

const DEEP_TARGETS = [
  "node_modules",
];

function hasFlag(flag: string): boolean {
  return process.argv
    .slice(2)
    .includes(flag);
}

async function removeTarget(
  relativePath: string,
): Promise<void> {
  const target = path.join(
    ROOT,
    relativePath,
  );

  try {
    const stats = await lstat(target);

    if (
      !stats.isDirectory() &&
      !stats.isSymbolicLink()
    ) {
      console.log(
        `[clean] Skipping non-directory: ${relativePath}`,
      );

      return;
    }

    await rm(target, {
      recursive: true,
      force: true,
    });

    console.log(
      `[clean] Removed: ${relativePath}`,
    );
  } catch (cause: unknown) {
    if (
      cause instanceof Error &&
      "code" in cause &&
      cause.code === "ENOENT"
    ) {
      return;
    }

    throw cause;
  }
}

async function main(): Promise<void> {
  const deep = hasFlag("--deep");

  console.log("");
  console.log("========================================");
  console.log(" Veyra — Clean");
  console.log("========================================");
  console.log("");

  for (const target of SAFE_TARGETS) {
    await removeTarget(target);
  }

  if (deep) {
    console.log("");
    console.log(
      "[clean] Deep clean requested.",
    );

    for (const target of DEEP_TARGETS) {
      await removeTarget(target);
    }
  }

  console.log("");
  console.log("[clean] Completed.");
  console.log("");

  if (!deep) {
    console.log(
      "Use --deep only when you intentionally want to remove node_modules.",
    );
    console.log("");
  }
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error
      ? cause.message
      : String(cause),
  );

  process.exitCode = 1;
});