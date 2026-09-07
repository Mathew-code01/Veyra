// scripts/setup-models.ts

/**
 * Veyra Local Model Setup
 *
 * Responsibilities:
 * - Detect Ollama availability.
 * - Inspect installed local models.
 * - Report missing recommended models.
 * - Optionally pull models when explicitly requested.
 *
 * Safe by default:
 *
 *   npm run setup:models
 *
 * Explicit model installation:
 *
 *   npm run setup:models -- --pull
 *
 * Specific model:
 *
 *   npm run setup:models -- --pull --model llama3.2
 */

/// <reference types="node" />

import {
  execFile,
  spawn,
} from "node:child_process";

import process from "node:process";

import { promisify } from "node:util";

const execFileAsync =
  promisify(execFile);

const DEFAULT_MODEL =
  "llama3.2";

interface ModelInfo {
  readonly name: string;
}

interface ScriptOptions {
  readonly pull: boolean;
  readonly model: string;
}

/**
 * Parse command-line arguments.
 */
function parseArguments(): ScriptOptions {
  const args =
    process.argv.slice(2);

  const pull =
    args.includes("--pull");

  const modelIndex =
    args.indexOf("--model");

  if (modelIndex === -1) {
    return {
      pull,
      model: DEFAULT_MODEL,
    };
  }

  const modelArgument =
    args[modelIndex + 1];

  if (
    !modelArgument ||
    modelArgument.startsWith("--")
  ) {
    throw new Error(
      "--model requires a model name.",
    );
  }

  const model =
    modelArgument.trim();

  if (!model) {
    throw new Error(
      "--model requires a non-empty model name.",
    );
  }

  return {
    pull,
    model,
  };
}

/**
 * Standard informational logger.
 */
function log(
  message: string,
): void {
  console.log(
    `[models] ${message}`,
  );
}

/**
 * Standard warning logger.
 */
function warn(
  message: string,
): void {
  console.warn(
    `[models] WARNING: ${message}`,
  );
}

/**
 * Standard error logger.
 */
function error(
  message: string,
): void {
  console.error(
    `[models] ERROR: ${message}`,
  );
}

/**
 * Check whether a command is available on PATH.
 */
async function commandExists(
  command: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      process.platform === "win32"
        ? "where"
        : "which",
      [command],
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieve locally installed Ollama models.
 */
async function getInstalledModels(): Promise<
  ModelInfo[]
> {
  const result =
    await execFileAsync(
      "ollama",
      ["list"],
      {
        timeout: 10_000,
        maxBuffer:
          1024 * 1024,
        windowsHide: true,
      },
    );

  const lines =
    result.stdout
      .split(/\r?\n/)
      .map(
        (line: string) =>
          line.trim(),
      )
      .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  return lines
    .slice(1)
    .map(
      (
        line: string,
      ): ModelInfo => {
        const [name] =
          line.split(/\s+/);

        return {
          name,
        };
      },
    );
}

/**
 * Determine whether a requested model is installed.
 *
 * Supports both:
 *
 *   llama3.2
 *
 * and:
 *
 *   llama3.2:latest
 */
function modelInstalled(
  models: readonly ModelInfo[],
  requestedModel: string,
): boolean {
  return models.some(
    (model) =>
      model.name ===
        requestedModel ||
      model.name.startsWith(
        `${requestedModel}:`,
      ),
  );
}

/**
 * Pull a model using the Ollama CLI.
 */
async function pullModel(
  model: string,
): Promise<void> {
  log(
    `Pulling Ollama model "${model}"...`,
  );

  log(
    "This may take a significant amount of time.",
  );

  await new Promise<void>(
    (
      resolve,
      reject,
    ) => {
      const child =
        spawn(
          "ollama",
          [
            "pull",
            model,
          ],
          {
            stdio: "inherit",
            windowsHide: true,
          },
        );

      child.once(
        "error",
        (
          cause: Error,
        ) => {
          reject(cause);
        },
      );

      child.once(
        "close",
        (
          code: number | null,
        ) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(
            new Error(
              `Ollama pull exited with code ${
                code ?? "unknown"
              }.`,
            ),
          );
        },
      );
    },
  );
}

/**
 * Main setup workflow.
 */
async function main(): Promise<void> {
  const options =
    parseArguments();

  console.log("");

  console.log(
    "========================================",
  );

  console.log(
    " Veyra — Local Model Setup",
  );

  console.log(
    "========================================",
  );

  console.log("");

  if (
    !(await commandExists(
      "ollama",
    ))
  ) {
    warn(
      "Ollama was not found on PATH.",
    );

    console.log("");

    console.log(
      "Local AI mode is optional.",
    );

    console.log(
      "Install Ollama if you want offline/local LLM support.",
    );

    console.log("");

    return;
  }

  log(
    "Ollama executable detected.",
  );

  try {
    const version =
      await execFileAsync(
        "ollama",
        ["--version"],
        {
          timeout: 10_000,
          windowsHide: true,
        },
      );

    log(
      `Detected: ${version.stdout.trim()}`,
    );
  } catch {
    warn(
      "Ollama was detected but its version could not be read.",
    );
  }

  let models: ModelInfo[];

  try {
    models =
      await getInstalledModels();
  } catch (cause: unknown) {
    const message =
      cause instanceof Error
        ? cause.message
        : String(cause);

    warn(
      `Unable to query installed Ollama models: ${message}`,
    );

    warn(
      "Make sure the Ollama service is running before retrying.",
    );

    return;
  }

  if (models.length === 0) {
    log(
      "No local Ollama models are currently installed.",
    );
  } else {
    log(
      "Installed models:",
    );

    for (const model of models) {
      console.log(
        `  - ${model.name}`,
      );
    }
  }

  const requestedModel =
    options.model;

  if (
    modelInstalled(
      models,
      requestedModel,
    )
  ) {
    log(
      `Required model "${requestedModel}" is installed.`,
    );

    console.log("");

    return;
  }

  warn(
    `Model "${requestedModel}" is not installed.`,
  );

  if (!options.pull) {
    console.log("");

    console.log(
      `To install it explicitly, run: npm run setup:models -- --pull --model ${requestedModel}`,
    );

    console.log("");

    return;
  }

  try {
    await pullModel(
      requestedModel,
    );

    log(
      `Model "${requestedModel}" installed successfully.`,
    );
  } catch (cause: unknown) {
    const message =
      cause instanceof Error
        ? cause.message
        : String(cause);

    error(message);

    process.exitCode = 1;

    return;
  }

  console.log("");
}

/**
 * Top-level error boundary.
 */
main().catch(
  (cause: unknown) => {
    const message =
      cause instanceof Error
        ? cause.message
        : String(cause);

    error(message);

    process.exitCode = 1;
  },
);