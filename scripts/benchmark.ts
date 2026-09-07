// scripts/benchmark.ts

/**
 * Veyra AI Pipeline Benchmark
 *
 * Measures HTTP AI endpoint latency.
 *
 * Usage:
 *
 *   npm run benchmark
 *
 * Optional:
 *
 *   VEYRA_BENCHMARK_URL=http://localhost:5000/health npm run benchmark
 *
 * The benchmark intentionally measures infrastructure latency separately
 * from model-specific internal metrics.
 */

/// <reference types="node" />

import process from "node:process";
import { performance } from "node:perf_hooks";

interface BenchmarkSample {
  readonly index: number;
  readonly durationMs: number;
  readonly ok: boolean;
}

interface BenchmarkSummary {
  readonly total: number;
  readonly successful: number;
  readonly failed: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
}

const DEFAULT_URL =
  process.env.VEYRA_BENCHMARK_URL ??
  "http://127.0.0.1:5000/health";

const ITERATIONS = Number(
  process.env.VEYRA_BENCHMARK_ITERATIONS ?? "10",
);

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort(
    (a, b) => a - b,
  );

  const index =
    Math.ceil(
      (percentileValue / 100) *
        sorted.length,
    ) - 1;

  return sorted[
    Math.max(0, index)
  ];
}

function summarize(
  samples: readonly BenchmarkSample[],
): BenchmarkSummary {
  const durations = samples
    .filter((sample) => sample.ok)
    .map((sample) => sample.durationMs);

  if (durations.length === 0) {
    return {
      total: samples.length,
      successful: 0,
      failed: samples.length,
      minMs: 0,
      maxMs: 0,
      averageMs: 0,
      p50Ms: 0,
      p95Ms: 0,
    };
  }

  return {
    total: samples.length,
    successful: durations.length,
    failed: samples.length - durations.length,
    minMs: Math.min(...durations),
    maxMs: Math.max(...durations),
    averageMs:
      durations.reduce(
        (sum, value) => sum + value,
        0,
      ) / durations.length,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
  };
}

async function runSample(
  index: number,
  url: string,
): Promise<BenchmarkSample> {
  const started = performance.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
      },
    });

    return {
      index,
      durationMs: performance.now() - started,
      ok: response.ok,
    };
  } catch {
    return {
      index,
      durationMs: performance.now() - started,
      ok: false,
    };
  }
}

async function main(): Promise<void> {
  if (
    !Number.isInteger(ITERATIONS) ||
    ITERATIONS < 1
  ) {
    throw new Error(
      "VEYRA_BENCHMARK_ITERATIONS must be a positive integer.",
    );
  }

  console.log("");
  console.log("========================================");
  console.log(" Veyra — AI Pipeline Benchmark");
  console.log("========================================");
  console.log("");

  console.log(`Target: ${DEFAULT_URL}`);
  console.log(`Iterations: ${ITERATIONS}`);
  console.log("");

  const samples: BenchmarkSample[] = [];

  for (
    let index = 1;
    index <= ITERATIONS;
    index += 1
  ) {
    const sample = await runSample(
      index,
      DEFAULT_URL,
    );

    samples.push(sample);

    console.log(
      `#${index.toString().padStart(2, "0")} ` +
        `${sample.durationMs.toFixed(2)} ms ` +
        `${sample.ok ? "OK" : "FAILED"}`,
    );
  }

  const summary = summarize(samples);

  console.log("");
  console.log("----------------------------------------");
  console.log("Results");
  console.log("----------------------------------------");
  console.log(
    `Successful: ${summary.successful}`,
  );
  console.log(
    `Failed:     ${summary.failed}`,
  );
  console.log(
    `Minimum:    ${summary.minMs.toFixed(2)} ms`,
  );
  console.log(
    `Average:    ${summary.averageMs.toFixed(2)} ms`,
  );
  console.log(
    `P50:        ${summary.p50Ms.toFixed(2)} ms`,
  );
  console.log(
    `P95:        ${summary.p95Ms.toFixed(2)} ms`,
  );
  console.log(
    `Maximum:    ${summary.maxMs.toFixed(2)} ms`,
  );
  console.log("");

  if (summary.successful === 0) {
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