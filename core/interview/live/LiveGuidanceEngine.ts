// ============================================================================
// FILE: core/interview/live/LiveGuidanceEngine.ts
// PURPOSE:
// Incremental live interview guidance engine.
//
// RESPONSIBILITY:
// - Receive finalized transcript segments from the audio pipeline.
// - Detect question boundaries and ignore continuations/duplicates.
// - Produce concise, structured guidance grounded in candidate evidence.
// - Debounce repeated processing of the same question.
// - Support cancellation and recovery from transient errors.
//
// ARCHITECTURAL RULE:
// This engine reuses `UnifiedInterviewRuntime` (the canonical orchestration
// path) for understanding, planning, evidence retrieval and follow-ups. It
// adds the live-specific concerns: boundary detection, deduplication,
// debouncing and structured guidance output. It does not duplicate the
// intelligence engines.
// ============================================================================

import type {
  InterviewRuntimeEvidence,
  InterviewRuntimeResponse,
} from "../runtime/UnifiedInterviewRuntime";

import type {
  FollowUpQuestion,
  InterviewDomainClassification,
  QuestionUnderstanding,
} from "../../../shared/types/interviews";

import { QuestionBoundaryDetector } from "./QuestionBoundaryDetector";

// ============================================================================
// TYPES
// ============================================================================

export interface LiveGuidance {
  readonly sessionId: string;
  readonly questionId: string;
  readonly questionText: string;
  readonly parts: readonly string[];
  readonly domain: InterviewDomainClassification;
  readonly competencies: readonly string[];
  readonly mainPoint: string;
  readonly structure: readonly string[];
  readonly talkingPoints: readonly string[];
  readonly evidence: readonly InterviewRuntimeEvidence[];
  readonly omissions: readonly string[];
  readonly followUps: readonly FollowUpQuestion[];
  readonly confidence: number;
  readonly assumptions: readonly string[];
  readonly missingInformation: readonly string[];
  readonly generatedAt: number;
}

export interface GuidanceRuntime {
  processQuestion(input: {
    readonly sessionId: string;
    readonly text: string;
    readonly source: string;
    readonly generateAI?: boolean;
    readonly signal?: AbortSignal;
  }): Promise<InterviewRuntimeResponse>;
}

export interface LiveGuidanceEngineOptions {
  readonly runtime: GuidanceRuntime;
  readonly detector: QuestionBoundaryDetector;

  /**
   * Minimum milliseconds between regenerating guidance for the same question.
   * Default: 1000.
   */
  readonly debounceMs?: number;
}

// ============================================================================
// ENGINE
// ============================================================================

export class LiveGuidanceEngine {
  private readonly runtime: GuidanceRuntime;

  private readonly detector: QuestionBoundaryDetector;

  private readonly debounceMs: number;

  private readonly cache = new Map<string, { guidance: LiveGuidance; time: number }>();

  public constructor(options: LiveGuidanceEngineOptions) {
    this.runtime = options.runtime;
    this.detector = options.detector;
    this.debounceMs = Math.max(0, options.debounceMs ?? 1_000);
  }

  public async produceGuidance(input: {
    readonly sessionId: string;
    readonly questionText: string;
    readonly previousQuestion?: string;
    readonly signal?: AbortSignal;
  }): Promise<LiveGuidance | null> {
    this.throwIfAborted(input.signal);

    const boundary = this.detector.detect(input.questionText, input.previousQuestion);
    if (!boundary.isNewQuestion) {
      return null;
    }

    const key = input.questionText.trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.time < this.debounceMs) {
      return cached.guidance;
    }

    this.throwIfAborted(input.signal);

    const response = await this.runtime.processQuestion({
      sessionId: input.sessionId,
      text: input.questionText,
      source: "voice_transcript",
      generateAI: false,
      signal: input.signal,
    });

    this.throwIfAborted(input.signal);

    const understanding = response.understanding as QuestionUnderstanding;
    const guidance: LiveGuidance = Object.freeze({
      sessionId: input.sessionId,
      questionId: response.questionId ?? "",
      questionText: response.questionText,
      parts: Object.freeze(boundary.parts),
      domain: response.domain,
      competencies: Object.freeze(understanding.assessedCompetencies ?? []),
      mainPoint: response.guidance.headline ?? understanding.coreIntent,
      structure: Object.freeze(response.guidance.structure ?? []),
      talkingPoints: Object.freeze(response.guidance.talkingPoints),
      evidence: Object.freeze(response.evidence),
      omissions: Object.freeze(response.provenance.missingInformation),
      followUps: Object.freeze(response.followUps),
      confidence: response.confidence,
      assumptions: Object.freeze(response.provenance.assumptions),
      missingInformation: Object.freeze(response.provenance.missingInformation),
      generatedAt: Date.now(),
    });

    this.cache.set(key, { guidance, time: Date.now() });
    return guidance;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException("Live guidance was cancelled.", "AbortError");
    }
  }
}
