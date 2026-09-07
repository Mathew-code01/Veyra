// core/analytics/ModelMetrics.ts

export interface ModelRequestMetric {
  readonly provider: string;
  readonly model: string;

  readonly latencyMs: number;
  readonly timeToFirstTokenMs?: number;

  readonly inputTokens?: number;
  readonly outputTokens?: number;

  readonly success: boolean;
  readonly errorCode?: string;

  readonly timestamp: number;
}

export interface ModelStatistics {
  readonly provider: string;
  readonly model: string;

  readonly requestCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;

  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;

  readonly averageTimeToFirstTokenMs?: number;

  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
}

export class ModelMetrics {
  private readonly metrics: ModelRequestMetric[] = [];

  public record(metric: ModelRequestMetric): void {
    if (
      !metric.provider ||
      !metric.model ||
      !Number.isFinite(metric.latencyMs)
    ) {
      return;
    }

    this.metrics.push({
      ...metric,
      timestamp: metric.timestamp || Date.now(),
    });
  }

  public getStatistics(): ModelStatistics[] {
    const groups = new Map<string, ModelRequestMetric[]>();

    for (const metric of this.metrics) {
      const key = `${metric.provider}:${metric.model}`;

      const group = groups.get(key) ?? [];

      group.push(metric);

      groups.set(key, group);
    }

    return [...groups.values()].map((group) => {
      const first = group[0];

      const latencyValues = group
        .map((metric) => metric.latencyMs)
        .sort((a, b) => a - b);

      const firstTokenValues = group
        .map((metric) => metric.timeToFirstTokenMs)
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value),
        )
        .sort((a, b) => a - b);

      const successCount = group.filter((metric) => metric.success).length;

      return {
        provider: first.provider,
        model: first.model,
        requestCount: group.length,
        successCount,
        failureCount: group.length - successCount,
        successRate: successCount / group.length,
        averageLatencyMs: average(latencyValues),
        p95LatencyMs: percentile(latencyValues, 0.95),
        averageTimeToFirstTokenMs:
          firstTokenValues.length > 0 ? average(firstTokenValues) : undefined,
        totalInputTokens: sumOptional(
          group.map((metric) => metric.inputTokens),
        ),
        totalOutputTokens: sumOptional(
          group.map((metric) => metric.outputTokens),
        ),
      };
    });
  }

  public clear(): void {
    this.metrics.length = 0;
  }

  public count(): number {
    return this.metrics.length;
  }
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: readonly number[], value: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = (sorted.length - 1) * value;

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function sumOptional(values: readonly (number | undefined)[]): number {
  return values.reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}
