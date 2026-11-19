export type AnalyticsEventType =
  | "app_start"
  | "app_shutdown"
  | "model_execution"
  | "model_runtime_initialization_failed"
  | "reliability"
  | "interview"
  | "audio"
  | "document"
  | "database"
  | "security"
  | "custom";

export type AnalyticsSeverity = "info" | "warning" | "error";

export interface AnalyticsEvent {
  readonly id: string;
  readonly type: AnalyticsEventType;
  readonly category: string;
  readonly severity: AnalyticsSeverity;
  readonly timestamp: number;
  readonly sessionId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly durationMs?: number;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface AnalyticsSink {
  publish(events: readonly AnalyticsEvent[]): Promise<void> | void;
}

export interface AnalyticsManagerOptions {
  readonly maxEvents?: number;
  readonly sink?: AnalyticsSink;
}

export class AnalyticsManager {
  private readonly sink?: AnalyticsSink;
  private readonly maxEvents: number;
  private readonly events: AnalyticsEvent[] = [];

  public constructor(options: AnalyticsManagerOptions = {}) {
    this.sink = options.sink;
    this.maxEvents = Math.max(1, options.maxEvents ?? 500);
  }

  public record(
    event: Omit<AnalyticsEvent, "id" | "timestamp"> & { timestamp?: number },
  ): AnalyticsEvent {
    const normalized: AnalyticsEvent = {
      id: createId(),
      type: event.type,
      category: event.category,
      severity: event.severity ?? "info",
      timestamp: event.timestamp ?? Date.now(),
      sessionId: event.sessionId,
      provider: event.provider,
      model: event.model,
      durationMs: event.durationMs,
      success: event.success,
      metadata: sanitizeMetadata(event.metadata),
    };

    this.events.push(normalized);

    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }

    if (this.sink) {
      void Promise.resolve(this.sink.publish([normalized])).catch(() => {
        // Analytics sinks should never derail the primary operation.
      });
    }

    return normalized;
  }

  public recordModelExecution(input: {
    readonly sessionId?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly durationMs?: number;
    readonly success: boolean;
    readonly metadata?: Record<string, unknown>;
  }): AnalyticsEvent {
    return this.record({
      type: "model_execution",
      category: "ai",
      severity: input.success ? "info" : "error",
      sessionId: input.sessionId,
      provider: input.provider,
      model: input.model,
      durationMs: input.durationMs,
      success: input.success,
      metadata: input.metadata,
    });
  }

  public recordReliability(input: {
    readonly sessionId?: string;
    readonly operation: string;
    readonly success: boolean;
    readonly durationMs?: number;
    readonly metadata?: Record<string, unknown>;
  }): AnalyticsEvent {
    return this.record({
      type: "reliability",
      category: "reliability",
      severity: input.success ? "info" : "warning",
      sessionId: input.sessionId,
      durationMs: input.durationMs,
      success: input.success,
      metadata: {
        ...input.metadata,
        operation: input.operation,
      },
    });
  }

  public list(): readonly AnalyticsEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events.length = 0;
  }
}

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata || Object.keys(metadata).length === 0) {
    return metadata;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key)) {
      redacted[key] = "[REDACTED]";
      continue;
    }

    if (value && typeof value === "object") {
      redacted[key] = sanitizeNested(value);
      continue;
    }

    redacted[key] = value;
  }

  return redacted;
}

function sanitizeNested(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeNested(entry));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else if (child && typeof child === "object") {
        result[key] = sanitizeNested(child);
      } else {
        result[key] = child;
      }
    }

    return result;
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();

  return /password|secret|token|api[_-]?key|authorization|cookie|session_secret|private[_-]?key/.test(
    normalized,
  );
}

function createId(): string {
  return `analytics-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
