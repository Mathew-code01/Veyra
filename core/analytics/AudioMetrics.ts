// core/analytics/AudioMetrics.ts

export interface AudioMetricSnapshot {
  readonly capturedDurationMs: number;
  readonly processedDurationMs: number;

  readonly chunkCount: number;
  readonly speechDurationMs: number;
  readonly silenceDurationMs: number;

  readonly transcriptionRequests: number;
  readonly transcriptionFailures: number;

  readonly averageRms: number;
  readonly peakRms: number;

  readonly droppedChunks: number;
  readonly clippingEvents: number;
}

export class AudioMetrics {
  private capturedDurationMs = 0;
  private processedDurationMs = 0;

  private chunkCount = 0;

  private speechDurationMs = 0;
  private silenceDurationMs = 0;

  private transcriptionRequests = 0;
  private transcriptionFailures = 0;

  private rmsSum = 0;
  private rmsSamples = 0;
  private peakRms = 0;

  private droppedChunks = 0;
  private clippingEvents = 0;

  public recordChunk(durationMs: number, rms?: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return;
    }

    this.chunkCount += 1;
    this.capturedDurationMs += durationMs;

    if (typeof rms === "number" && Number.isFinite(rms)) {
      this.rmsSum += rms;
      this.rmsSamples += 1;
      this.peakRms = Math.max(this.peakRms, rms);
    }
  }

  public recordProcessed(durationMs: number): void {
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      this.processedDurationMs += durationMs;
    }
  }

  public recordSpeech(durationMs: number): void {
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      this.speechDurationMs += durationMs;
    }
  }

  public recordSilence(durationMs: number): void {
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      this.silenceDurationMs += durationMs;
    }
  }

  public recordTranscriptionRequest(success: boolean): void {
    this.transcriptionRequests += 1;

    if (!success) {
      this.transcriptionFailures += 1;
    }
  }

  public recordDroppedChunk(): void {
    this.droppedChunks += 1;
  }

  public recordClipping(): void {
    this.clippingEvents += 1;
  }

  public snapshot(): AudioMetricSnapshot {
    return {
      capturedDurationMs: this.capturedDurationMs,

      processedDurationMs: this.processedDurationMs,

      chunkCount: this.chunkCount,

      speechDurationMs: this.speechDurationMs,

      silenceDurationMs: this.silenceDurationMs,

      transcriptionRequests: this.transcriptionRequests,

      transcriptionFailures: this.transcriptionFailures,

      averageRms: this.rmsSamples > 0 ? this.rmsSum / this.rmsSamples : 0,

      peakRms: this.peakRms,

      droppedChunks: this.droppedChunks,

      clippingEvents: this.clippingEvents,
    };
  }

  public reset(): void {
    this.capturedDurationMs = 0;
    this.processedDurationMs = 0;
    this.chunkCount = 0;
    this.speechDurationMs = 0;
    this.silenceDurationMs = 0;
    this.transcriptionRequests = 0;
    this.transcriptionFailures = 0;
    this.rmsSum = 0;
    this.rmsSamples = 0;
    this.peakRms = 0;
    this.droppedChunks = 0;
    this.clippingEvents = 0;
  }
}
