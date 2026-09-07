// core/analytics/PerformanceAnalyzer.ts

import type {
  LatencyStatistics,
  LatencyStage,
  LatencyTracker,
} from "./LatencyTracker";

import type { ModelStatistics, ModelMetrics } from "./ModelMetrics";

import type { AudioMetricSnapshot, AudioMetrics } from "./AudioMetrics";

import type { SessionMetricsSnapshot, SessionMetrics } from "./SessionMetrics";

export type PerformanceSeverity = "info" | "warning" | "critical";

export interface PerformanceFinding {
  readonly severity: PerformanceSeverity;
  readonly category: "latency" | "audio" | "model" | "reliability" | "session";
  readonly title: string;
  readonly message: string;
  readonly metric?: number;
  readonly threshold?: number;
}

export interface PerformanceReport {
  readonly generatedAt: number;
  readonly findings: readonly PerformanceFinding[];

  readonly latency: Record<LatencyStage, LatencyStatistics>;

  readonly models: readonly ModelStatistics[];

  readonly audio: AudioMetricSnapshot;

  readonly session?: SessionMetricsSnapshot;
}

export interface PerformanceAnalyzerOptions {
  readonly transcriptionLatencyWarningMs?: number;
  readonly retrievalLatencyWarningMs?: number;
  readonly firstTokenWarningMs?: number;
  readonly totalPipelineWarningMs?: number;
  readonly modelFailureRateWarning?: number;
  readonly audioDropRateWarning?: number;
}

export class PerformanceAnalyzer {
  private readonly latencyTracker: LatencyTracker;
  private readonly modelMetrics: ModelMetrics;
  private readonly audioMetrics: AudioMetrics;

  private readonly thresholds: Required<PerformanceAnalyzerOptions>;

  public constructor(options: {
    latencyTracker: LatencyTracker;
    modelMetrics: ModelMetrics;
    audioMetrics: AudioMetrics;
    thresholds?: PerformanceAnalyzerOptions;
  }) {
    this.latencyTracker = options.latencyTracker;

    this.modelMetrics = options.modelMetrics;

    this.audioMetrics = options.audioMetrics;

    this.thresholds = {
      transcriptionLatencyWarningMs:
        options.thresholds?.transcriptionLatencyWarningMs ?? 1_500,

      retrievalLatencyWarningMs:
        options.thresholds?.retrievalLatencyWarningMs ?? 500,

      firstTokenWarningMs: options.thresholds?.firstTokenWarningMs ?? 2_000,

      totalPipelineWarningMs:
        options.thresholds?.totalPipelineWarningMs ?? 4_000,

      modelFailureRateWarning:
        options.thresholds?.modelFailureRateWarning ?? 0.1,

      audioDropRateWarning: options.thresholds?.audioDropRateWarning ?? 0.02,
    };
  }

  public analyze(sessionMetrics?: SessionMetrics): PerformanceReport {
    const latency = this.latencyTracker.getAllStatistics();

    const models = this.modelMetrics.getStatistics();

    const audio = this.audioMetrics.snapshot();

    const session = sessionMetrics?.snapshot();

    const findings: PerformanceFinding[] = [];

    this.analyzeLatency(latency, findings);

    this.analyzeModels(models, findings);

    this.analyzeAudio(audio, findings);

    this.analyzeSession(session, findings);

    return {
      generatedAt: Date.now(),
      findings,
      latency,
      models,
      audio,
      session,
    };
  }

  private analyzeLatency(
    latency: Record<LatencyStage, LatencyStatistics>,
    findings: PerformanceFinding[],
  ): void {
    this.checkLatency(
      latency,
      "transcription",
      this.thresholds.transcriptionLatencyWarningMs,
      findings,
      "Transcription latency is high.",
    );

    this.checkLatency(
      latency,
      "context_retrieval",
      this.thresholds.retrievalLatencyWarningMs,
      findings,
      "Context retrieval is becoming a bottleneck.",
    );

    this.checkLatency(
      latency,
      "model_first_token",
      this.thresholds.firstTokenWarningMs,
      findings,
      "Model time-to-first-token is high.",
    );

    this.checkLatency(
      latency,
      "total_pipeline",
      this.thresholds.totalPipelineWarningMs,
      findings,
      "End-to-end pipeline latency is high.",
    );
  }

  private analyzeModels(
    models: readonly ModelStatistics[],
    findings: PerformanceFinding[],
  ): void {
    for (const model of models) {
      const failureRate = 1 - model.successRate;

      if (failureRate >= this.thresholds.modelFailureRateWarning) {
        findings.push({
          severity: failureRate >= 0.25 ? "critical" : "warning",

          category: "reliability",

          title: "AI provider failure rate is elevated.",

          message: `${model.provider}/${model.model} has a ${(
            failureRate * 100
          ).toFixed(1)}% failure rate.`,

          metric: failureRate,

          threshold: this.thresholds.modelFailureRateWarning,
        });
      }
    }
  }

  private analyzeAudio(
    audio: AudioMetricSnapshot,
    findings: PerformanceFinding[],
  ): void {
    if (audio.chunkCount === 0) {
      return;
    }

    const dropRate = audio.droppedChunks / audio.chunkCount;

    if (dropRate >= this.thresholds.audioDropRateWarning) {
      findings.push({
        severity: dropRate >= 0.1 ? "critical" : "warning",

        category: "audio",

        title: "Audio chunks are being dropped.",

        message: `${(dropRate * 100).toFixed(
          1,
        )}% of captured chunks were dropped.`,

        metric: dropRate,

        threshold: this.thresholds.audioDropRateWarning,
      });
    }

    if (audio.clippingEvents > 0) {
      findings.push({
        severity: "warning",
        category: "audio",
        title: "Audio clipping detected.",
        message: `${audio.clippingEvents} clipping events were detected. Check microphone gain or normalization.`,
        metric: audio.clippingEvents,
        threshold: 0,
      });
    }

    if (audio.transcriptionRequests > 0 && audio.transcriptionFailures > 0) {
      const failureRate =
        audio.transcriptionFailures / audio.transcriptionRequests;

      findings.push({
        severity: failureRate >= 0.25 ? "critical" : "warning",

        category: "audio",

        title: "Transcription failures detected.",

        message: `${(failureRate * 100).toFixed(
          1,
        )}% of transcription requests failed.`,

        metric: failureRate,
        threshold: 0,
      });
    }
  }

  private analyzeSession(
    session: SessionMetricsSnapshot | undefined,
    findings: PerformanceFinding[],
  ): void {
    if (!session) {
      return;
    }

    if (session.failedAnswerCount > 0) {
      findings.push({
        severity: session.failedAnswerCount >= 3 ? "critical" : "warning",

        category: "session",

        title: "Some generated answers failed.",

        message: `${session.failedAnswerCount} answer generation requests failed during the session.`,

        metric: session.failedAnswerCount,

        threshold: 0,
      });
    }

    if (session.errors > 0) {
      findings.push({
        severity: session.errors >= 5 ? "warning" : "info",

        category: "session",

        title: "Session errors were recorded.",

        message: `${session.errors} session-level errors were recorded.`,

        metric: session.errors,

        threshold: 0,
      });
    }
  }

  private checkLatency(
    latency: Record<LatencyStage, LatencyStatistics>,
    stage: LatencyStage,
    threshold: number,
    findings: PerformanceFinding[],
    message: string,
  ): void {
    const stats = latency[stage];

    if (!stats) {
      return;
    }

    if (stats.p95Ms < threshold) {
      return;
    }

    findings.push({
      severity: stats.p95Ms >= threshold * 2 ? "critical" : "warning",

      category: "latency",

      title: message,

      message: `${stage} p95 latency is ${stats.p95Ms.toFixed(0)}ms.`,

      metric: stats.p95Ms,

      threshold,
    });
  }
}
