// scripts/benchmark-audio.ts

/**
 * Veyra Audio Benchmark
 *
 * Measures transcription endpoint latency.
 *
 * Usage:
 *
 *   npm run benchmark:audio
 *
 * Optional:
 *
 *   VEYRA_TRANSCRIPTION_URL=http://127.0.0.1:5000/api/transcription
 *   VEYRA_AUDIO_FILE=tests/fixtures/audio/sample.wav
 *
 * The benchmark does not upload an audio file unless the user explicitly
 * configures the endpoint and fixture.
 */

/// <reference types="node" />

import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(
  fileURLToPath(import.meta.url),
);

const ROOT = path.resolve(
  SCRIPT_DIRECTORY,
  "..",
);

const endpoint =
  process.env.VEYRA_TRANSCRIPTION_URL?.trim() ?? "";

const configuredFile =
  process.env.VEYRA_AUDIO_FILE?.trim() ?? "";

interface BenchmarkResult {
  readonly durationMs: number;
  readonly status: number | null;
  readonly ok: boolean;
}

/**
 * Check whether a file exists and is accessible.
 */
async function exists(
  file: string,
): Promise<boolean> {
  try {
    await access(file);

    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a Node.js Buffer into a standalone ArrayBuffer.
 *
 * Node's Buffer can expose an ArrayBufferLike backing store, which may be
 * SharedArrayBuffer-compatible. The Web Fetch/Blob typings used by modern
 * TypeScript require a concrete ArrayBuffer for BlobPart.
 *
 * Creating a fresh ArrayBuffer here gives Blob an unambiguous, compatible
 * binary representation.
 */
function bufferToArrayBuffer(
  buffer: Buffer,
): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(
    buffer.byteLength,
  );

  new Uint8Array(arrayBuffer).set(
    buffer,
  );

  return arrayBuffer;
}

/**
 * Benchmark a transcription request using a local audio fixture.
 */
async function benchmark(
  url: string,
  filePath: string,
): Promise<BenchmarkResult> {
  const form = new FormData();

  const file = createReadStream(
    filePath,
  );

  const chunks: ArrayBuffer[] = [];

  try {
    for await (const chunk of file) {
      const buffer = Buffer.isBuffer(
        chunk,
      )
        ? chunk
        : Buffer.from(chunk);

      chunks.push(
        bufferToArrayBuffer(buffer),
      );
    }
  } finally {
    file.destroy();
  }

  const blob = new Blob(
    chunks,
    {
      type: "audio/wav",
    },
  );

  form.append(
    "audio",
    blob,
    path.basename(filePath),
  );

  const started =
    performance.now();

  try {
    const response = await fetch(
      url,
      {
        method: "POST",
        body: form,
        signal:
          AbortSignal.timeout(
            120_000,
          ),
      },
    );

    return {
      durationMs:
        performance.now() -
        started,
      status: response.status,
      ok: response.ok,
    };
  } catch {
    return {
      durationMs:
        performance.now() -
        started,
      status: null,
      ok: false,
    };
  }
}

/**
 * Run the benchmark.
 */
async function main(): Promise<void> {
  console.log("");

  console.log(
    "========================================",
  );

  console.log(
    " Veyra — Audio Benchmark",
  );

  console.log(
    "========================================",
  );

  console.log("");

  if (!endpoint) {
    console.log(
      "No VEYRA_TRANSCRIPTION_URL configured.",
    );

    console.log("");

    console.log(
      "The benchmark is intentionally disabled until a " +
        "transcription endpoint is provided.",
    );

    console.log("");

    console.log(
      "Example:",
    );

    console.log(
      "VEYRA_TRANSCRIPTION_URL=http://127.0.0.1:5000/api/transcription",
    );

    console.log("");

    return;
  }

  if (!configuredFile) {
    console.log(
      "No VEYRA_AUDIO_FILE configured.",
    );

    console.log(
      "Set it to a local WAV/audio fixture before running the benchmark.",
    );

    console.log("");

    return;
  }

  const audioPath =
    path.isAbsolute(
      configuredFile,
    )
      ? configuredFile
      : path.resolve(
          ROOT,
          configuredFile,
        );

  if (!(await exists(audioPath))) {
    throw new Error(
      `Audio fixture does not exist: ${audioPath}`,
    );
  }

  console.log(
    `Endpoint: ${endpoint}`,
  );

  console.log(
    `Audio: ${audioPath}`,
  );

  console.log("");

  const result =
    await benchmark(
      endpoint,
      audioPath,
    );

  console.log(
    `Latency: ${result.durationMs.toFixed(2)} ms`,
  );

  console.log(
    `Status: ${result.status ?? "request failed"}`,
  );

  console.log(
    `Result: ${result.ok ? "PASS" : "FAIL"}`,
  );

  console.log("");

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch(
  (cause: unknown) => {
    console.error(
      cause instanceof Error
        ? cause.message
        : String(cause),
    );

    process.exitCode = 1;
  },
);