// scripts/check-environment.ts


/**
 * Veyra Environment Checker
 *
 * Verifies:
 * - Node.js
 * - npm
 * - Git
 * - project files
 * - optional Ollama
 * - required directories
 *
 * Exit code:
 *   0 = environment is usable
 *   1 = required dependency/configuration missing
 */

/// <reference types="node" />

import { access, constants } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

interface CheckResult {
  readonly name: string;
  readonly required: boolean;
  readonly passed: boolean;
  readonly detail: string;
}

const checks: CheckResult[] = [];

function addCheck(result: CheckResult): void {
  checks.push(result);

  const status = result.passed
    ? "PASS"
    : "FAIL";

  const requirement = result.required
    ? "required"
    : "optional";

  console.log(
    `[${status}] ${result.name} (${requirement}) — ${result.detail}`,
  );
}

async function fileExists(
  relativePath: string,
): Promise<boolean> {
  try {
    await access(
      path.join(ROOT, relativePath),
      constants.F_OK,
    );

    return true;
  } catch {
    return false;
  }
}

async function commandVersion(
  command: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    const result = await execFileAsync(
      command,
      [...args],
      {
        timeout: 10_000,
        windowsHide: true,
      },
    );

    return (
      result.stdout.trim() ||
      result.stderr.trim()
    );
  } catch {
    return null;
  }
}

async function checkNode(): Promise<void> {
  const major = Number(
    process.versions.node.split(".")[0],
  );

  addCheck({
    name: "Node.js",
    required: true,
    passed:
      Number.isInteger(major) &&
      major >= 20,
    detail:
      Number.isInteger(major) &&
      major >= 20
        ? process.versions.node
        : `Detected ${process.versions.node}; Node.js 20+ required`,
  });
}

async function checkNpm(): Promise<void> {
  const version = await commandVersion(
    process.platform === "win32"
      ? "npm.cmd"
      : "npm",
    ["--version"],
  );

  addCheck({
    name: "npm",
    required: true,
    passed: version !== null,
    detail: version ?? "npm not found",
  });
}

async function checkGit(): Promise<void> {
  const version = await commandVersion(
    "git",
    ["--version"],
  );

  addCheck({
    name: "Git",
    required: true,
    passed: version !== null,
    detail: version ?? "Git not found",
  });
}

async function checkOllama(): Promise<void> {
  const version = await commandVersion(
    "ollama",
    ["--version"],
  );

  addCheck({
    name: "Ollama",
    required: false,
    passed: version !== null,
    detail:
      version ??
      "Not installed — local AI mode will be unavailable",
  });
}

async function checkRequiredFiles(): Promise<void> {
  const requiredFiles = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "client",
    "desktop",
    "server",
    "core",
    "database",
    "shared",
    "scripts",
    "docs",
  ];

  for (const file of requiredFiles) {
    const exists = await fileExists(file);

    addCheck({
      name: file,
      required: true,
      passed: exists,
      detail: exists
        ? "found"
        : "missing",
    });
  }
}

async function checkNodeModules(): Promise<void> {
  const exists = await fileExists(
    "node_modules",
  );

  addCheck({
    name: "Dependencies",
    required: true,
    passed: exists,
    detail: exists
      ? "node_modules exists"
      : "Run npm install",
  });
}

async function main(): Promise<void> {
  console.log("");
  console.log("========================================");
  console.log(" Veyra — Environment Check");
  console.log("========================================");
  console.log("");

  await checkNode();
  await checkNpm();
  await checkGit();
  await checkOllama();
  await checkRequiredFiles();
  await checkNodeModules();

  const failures = checks.filter(
    (check) =>
      check.required &&
      !check.passed,
  );

  const warnings = checks.filter(
    (check) =>
      !check.required &&
      !check.passed,
  );

  console.log("");
  console.log("----------------------------------------");
  console.log(
    `Required failures: ${failures.length}`,
  );
  console.log(
    `Optional warnings: ${warnings.length}`,
  );
  console.log("----------------------------------------");

  if (failures.length > 0) {
    console.log("");
    console.log(
      "Environment check failed.",
    );

    for (const failure of failures) {
      console.log(
        `  - ${failure.name}: ${failure.detail}`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(
    "Environment is ready for Veyra development.",
  );
  console.log("");
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error
      ? cause.message
      : String(cause),
  );

  process.exitCode = 1;
});