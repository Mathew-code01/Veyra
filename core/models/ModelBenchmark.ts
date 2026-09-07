// Relative path: core/models/ModelBenchmark.ts

import type { ModelDefinition } from "./ModelRegistry";

export interface ModelBenchmarkMetrics {
  readonly startupMs: number | null;
  readonly firstTokenMs: number | null;
  readonly completionMs: number | null;
  readonly tokensPerSecond: number | null;
  readonly audioRealtimeFactor: number | null;
  readonly memoryUsedBytes: number | null;
  readonly success: boolean;
}

export interface ModelBenchmarkResult {
  readonly modelId: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly metrics: ModelBenchmarkMetrics;
  readonly error?: string;
}

export interface ModelBenchmarkOptions {
  readonly timeoutMs?: number;
  readonly prompt?: string;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface ModelBenchmarkRunner {
  run(
    model: ModelDefinition,
    options: ModelBenchmarkOptions,
  ): Promise<ModelBenchmarkMetrics>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      reject(new Error(`Model benchmark timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    const abortHandler = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      reject(new DOMException("Model benchmark was aborted.", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
        return;
      }

      signal.addEventListener("abort", abortHandler, {
        once: true,
      });
    }

    promise.then(
      (value) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        signal?.removeEventListener("abort", abortHandler);

        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);

        signal?.removeEventListener("abort", abortHandler);

        reject(error);
      },
    );
  });
}

export class ModelBenchmark {
  private readonly results = new Map<string, ModelBenchmarkResult>();

  public constructor(private readonly runner?: ModelBenchmarkRunner) {}

  public async benchmark(
    model: ModelDefinition,
    options: ModelBenchmarkOptions = {},
  ): Promise<ModelBenchmarkResult> {
    const startedAt = Date.now();

    if (!this.runner) {
      const result = Object.freeze({
        modelId: model.id,
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        metrics: {
          startupMs: null,
          firstTokenMs: null,
          completionMs: null,
          tokensPerSecond: null,
          audioRealtimeFactor: null,
          memoryUsedBytes: null,
          success: false,
        },
        error:
          "No benchmark runner has been configured for this model runtime.",
      });

      this.results.set(model.id, result);

      return result;
    }

    try {
      const metrics = await withTimeout(
        this.runner.run(model, options),
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        options.signal,
      );

      const completedAt = Date.now();

      const result = Object.freeze({
        modelId: model.id,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        metrics: Object.freeze({
          ...metrics,
          success: true,
        }),
      });

      this.results.set(model.id, result);

      return result;
    } catch (error) {
      const completedAt = Date.now();

      const result = Object.freeze({
        modelId: model.id,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        metrics: Object.freeze({
          startupMs: null,
          firstTokenMs: null,
          completionMs: null,
          tokensPerSecond: null,
          audioRealtimeFactor: null,
          memoryUsedBytes: null,
          success: false,
        }),
        error:
          error instanceof Error ? error.message : "Model benchmark failed.",
      });

      this.results.set(model.id, result);

      return result;
    }
  }

  public getResult(modelId: string): ModelBenchmarkResult | undefined {
    return this.results.get(modelId);
  }

  public listResults(): readonly ModelBenchmarkResult[] {
    return [...this.results.values()];
  }

  public clear(): void {
    this.results.clear();
  }

  public rank(modelIds?: readonly string[]): readonly ModelBenchmarkResult[] {
    const results = modelIds
      ? modelIds
          .map((id) => this.results.get(id))
          .filter(
            (result): result is ModelBenchmarkResult => result !== undefined,
          )
      : this.listResults();

    return [...results].sort((a, b) => {
      if (a.metrics.success !== b.metrics.success) {
        return a.metrics.success ? -1 : 1;
      }

      const aFirstToken = a.metrics.firstTokenMs ?? Number.POSITIVE_INFINITY;

      const bFirstToken = b.metrics.firstTokenMs ?? Number.POSITIVE_INFINITY;

      return aFirstToken - bFirstToken;
    });
  }
}
