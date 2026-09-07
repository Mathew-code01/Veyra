// scripts/benchmark-vision.ts


/**
 * Veyra Vision Benchmark
 *
 * Measures authorized vision-analysis endpoint latency.
 *
 * Required environment variables:
 *
 *   VEYRA_VISION_URL
 *   VEYRA_IMAGE_FILE
 */

/// <reference types="node" />

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIRECTORY, "..");

const endpoint = process.env.VEYRA_VISION_URL ?? "";
const configuredFile = process.env.VEYRA_IMAGE_FILE ?? "";

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function detectMimeType(filePath: string): string {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  switch (extension) {
    case ".png":
      return "image/png";

    case ".jpg":
    case ".jpeg":
      return "image/jpeg";

    case ".webp":
      return "image/webp";

    default:
      return "application/octet-stream";
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("========================================");
  console.log(" Veyra — Vision Benchmark");
  console.log("========================================");
  console.log("");

  if (!endpoint) {
    console.log(
      "No VEYRA_VISION_URL configured.",
    );
    console.log(
      "Vision benchmarking is disabled.",
    );
    console.log("");
    return;
  }

  if (!configuredFile) {
    console.log(
      "No VEYRA_IMAGE_FILE configured.",
    );
    console.log(
      "Provide a local image fixture to benchmark vision processing.",
    );
    console.log("");
    return;
  }

  const imagePath = path.isAbsolute(configuredFile)
    ? configuredFile
    : path.join(ROOT, configuredFile);

  if (!(await exists(imagePath))) {
    throw new Error(
      `Image fixture does not exist: ${imagePath}`,
    );
  }

  const image = await readFile(imagePath);
  const mimeType = detectMimeType(imagePath);

  const payload = {
    image: image.toString("base64"),
    mimeType,
  };

  const started = performance.now();

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (cause: unknown) {
    const duration = performance.now() - started;

    console.error(
      `Vision request failed after ${duration.toFixed(2)} ms.`,
    );

    console.error(
      cause instanceof Error
        ? cause.message
        : String(cause),
    );

    process.exitCode = 1;
    return;
  }

  const duration = performance.now() - started;

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Image: ${imagePath}`);
  console.log(`MIME: ${mimeType}`);
  console.log(`Payload: ${image.byteLength} bytes`);
  console.log(`Latency: ${duration.toFixed(2)} ms`);
  console.log(`HTTP: ${response.status}`);

  console.log(
    `Result: ${response.ok ? "PASS" : "FAIL"}`,
  );

  console.log("");

  if (!response.ok) {
    process.exitCode = 1;
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