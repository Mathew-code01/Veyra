// core/analytics/SessionMetrics.ts

export interface SessionMetricsSnapshot {
  readonly sessionId: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly durationMs: number;

  readonly transcriptCharacters: number;
  readonly transcriptWords: number;

  readonly questionCount: number;
  readonly followUpCount: number;

  readonly generatedAnswerCount: number;
  readonly completedAnswerCount: number;
  readonly failedAnswerCount: number;

  readonly contextQueries: number;
  readonly visionRequests: number;

  readonly errors: number;
}

export class SessionMetrics {
  private readonly sessionId: string;
  private readonly startedAt: number;

  private endedAt?: number;

  private transcriptCharacters = 0;
  private transcriptWords = 0;

  private questionCount = 0;
  private followUpCount = 0;

  private generatedAnswerCount = 0;
  private completedAnswerCount = 0;
  private failedAnswerCount = 0;

  private contextQueries = 0;
  private visionRequests = 0;

  private errors = 0;

  public constructor(sessionId: string, startedAt = Date.now()) {
    if (!sessionId.trim()) {
      throw new Error("Session ID is required.");
    }

    this.sessionId = sessionId;
    this.startedAt = startedAt;
  }

  public recordTranscript(text: string): void {
    const normalized = text.trim();

    if (!normalized) {
      return;
    }

    this.transcriptCharacters += normalized.length;

    this.transcriptWords += normalized.split(/\s+/).filter(Boolean).length;
  }

  public recordQuestion(followUp = false): void {
    this.questionCount += 1;

    if (followUp) {
      this.followUpCount += 1;
    }
  }

  public recordAnswerGenerated(): void {
    this.generatedAnswerCount += 1;
  }

  public recordAnswerCompleted(): void {
    this.completedAnswerCount += 1;
  }

  public recordAnswerFailed(): void {
    this.failedAnswerCount += 1;
  }

  public recordContextQuery(): void {
    this.contextQueries += 1;
  }

  public recordVisionRequest(): void {
    this.visionRequests += 1;
  }

  public recordError(): void {
    this.errors += 1;
  }

  public end(endedAt = Date.now()): void {
    this.endedAt = Math.max(this.startedAt, endedAt);
  }

  public snapshot(now = Date.now()): SessionMetricsSnapshot {
    const end = this.endedAt ?? Math.max(this.startedAt, now);

    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs: end - this.startedAt,

      transcriptCharacters: this.transcriptCharacters,

      transcriptWords: this.transcriptWords,

      questionCount: this.questionCount,

      followUpCount: this.followUpCount,

      generatedAnswerCount: this.generatedAnswerCount,

      completedAnswerCount: this.completedAnswerCount,

      failedAnswerCount: this.failedAnswerCount,

      contextQueries: this.contextQueries,

      visionRequests: this.visionRequests,

      errors: this.errors,
    };
  }
}
