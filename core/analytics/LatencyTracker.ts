// core/analytics/LatencyTracker.ts

export type LatencyStage =
  | "audio_capture"
  | "voice_activity"
  | "transcription"
  | "question_detection"
  | "context_retrieval"
  | "context_compression"
  | "model_first_token"
  | "model_completion"
  | "vision_processing"
  | "total_pipeline";

export interface LatencyMeasurement {
  readonly stage: LatencyStage;
  readonly durationMs: number;
  readonly timestamp: number;
  readonly metadata?: Record<string, unknown>;
}

export interface LatencyStatistics {
  readonly count: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly averageMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

export class LatencyTracker {
  private readonly measurements = new Map<LatencyStage, number[]>();

  private readonly active = new Map<
    string,
    {
      stage: LatencyStage;
      startedAt: number;
      metadata?: Record<string, unknown>;
    }
  >();

  public start(
    stage: LatencyStage,
    id = createId(),
    metadata?: Record<string, unknown>,
  ): string {
    this.active.set(id, {
      stage,
      startedAt: now(),
      metadata,
    });

    return id;
  }

  public stop(id: string): LatencyMeasurement | null {
    const active = this.active.get(id);

    if (!active) {
      return null;
    }

    this.active.delete(id);

    const durationMs = Math.max(0, now() - active.startedAt);

    const measurement: LatencyMeasurement = {
      stage: active.stage,
      durationMs,
      timestamp: Date.now(),
      metadata: active.metadata,
    };

    this.record(measurement);

    return measurement;
  }

  public async measure<T>(
    stage: LatencyStage,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<{
    result: T;
    measurement: LatencyMeasurement;
  }> {
    const id = this.start(stage, undefined, metadata);

    try {
      const result = await operation();

      const measurement = this.stop(id);

      if (!measurement) {
        throw new Error(`Latency measurement "${id}" was lost.`);
      }

      return {
        result,
        measurement,
      };
    } catch (error) {
      this.stop(id);
      throw error;
    }
  }

  public record(measurement: LatencyMeasurement): void {
    if (
      !Number.isFinite(measurement.durationMs) ||
      measurement.durationMs < 0
    ) {
      return;
    }

    const values = this.measurements.get(measurement.stage) ?? [];

    values.push(measurement.durationMs);

    this.measurements.set(measurement.stage, values);
  }

  public getStatistics(stage: LatencyStage): LatencyStatistics | null {
    const values = this.measurements.get(stage);

    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);

    return {
      count: sorted.length,
      minMs: sorted[0],
      maxMs: sorted.at(-1) ?? sorted[0],
      averageMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      medianMs: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
    };
  }

  public getAllStatistics(): Record<LatencyStage, LatencyStatistics> {
    const result = {} as Record<LatencyStage, LatencyStatistics>;

    for (const stage of this.measurements.keys()) {
      const statistics = this.getStatistics(stage);

      if (statistics) {
        result[stage] = statistics;
      }
    }

    return result;
  }

  public clear(): void {
    this.measurements.clear();
    this.active.clear();
  }
}

function percentile(
  sorted: readonly number[],
  percentileValue: number,
): number {
  if (sorted.length === 1) {
    return sorted[0];
  }

  const index = (sorted.length - 1) * percentileValue;

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function createId(): string {
  return `latency-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
