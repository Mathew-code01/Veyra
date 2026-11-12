// ============================================================================
// FILE: core/interview/live/QuestionBoundaryDetector.ts
// PURPOSE:
// Deterministic question-boundary detection for live interview transcripts.
//
// RESPONSIBILITY:
// - Decide whether a transcript segment contains a new interviewer question.
// - Split multi-part questions into their constituent parts.
// - Detect follow-up and clarification questions relative to the previous one.
//
// ARCHITECTURAL RULE:
// This is a deterministic, heuristic boundary detector. It does NOT perform
// AI inference and does not duplicate the semantic question-understanding
// engine. It complements `QuestionUnderstandingEngine` by segmenting the
// raw transcript stream before classification.
//
// One canonical detector is used by the live guidance pipeline.
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export interface QuestionBoundary {
  /**
   * Whether the segment appears to contain a new interviewer question.
   */
  readonly isNewQuestion: boolean;

  /**
   * Whether the segment contains multiple distinct questions.
   */
  readonly isMultiPart: boolean;

  /**
   * The individual parts of a multi-part question (one entry when not multi-part).
   */
  readonly parts: readonly string[];

  /**
   * Whether the segment appears to be a follow-up to the previous question.
   */
  readonly isFollowUp: boolean;

  /**
   * Whether the segment asks for clarification or elaboration.
   */
  readonly isClarification: boolean;

  /**
   * Confidence in the boundary decision (0 to 1).
   */
  readonly confidence: number;
}

export interface QuestionBoundaryDetectorOptions {
  readonly maxParts?: number;
}

// ============================================================================
// PATTERNS
// ============================================================================

const QUESTION_WORD_PATTERN = /^(who|what|when|where|why|how|which|whose|whom|can|could|would|should|do|does|did|is|are|was|were|will|describe|tell|explain|walk|share|give)\b/i;

const FOLLOW_UP_PATTERN = /^(why|how|what about|and what|can you elaborate|could you elaborate|tell me more|what do you mean|how so|what happened next|what was the result|and then|also)\b/i;

const CLARIFICATION_PATTERN = /(what do you mean|clarify|elaborate|can you repeat|say that again|i didn't catch|i missed that)/i;

const MULTI_PART_SPLIT = /[?.;]\s+|(?:\band then\b|\balso\b|\bplus\b|\band\b)\s+/i;

// ============================================================================
// DETECTOR
// ============================================================================

export class QuestionBoundaryDetector {
  private readonly maxParts: number;

  public constructor(options: QuestionBoundaryDetectorOptions = {}) {
    this.maxParts = Math.max(1, options.maxParts ?? 5);
  }

  public detect(
    text: string,
    previousQuestion?: string,
  ): QuestionBoundary {
    const cleaned = text.trim();
    if (!cleaned) {
      return this.empty();
    }

    const parts = this.splitParts(cleaned);
    const questionParts = parts.filter((part) => this.isQuestionPart(part));

    const isNewQuestion =
      questionParts.length > 0 ||
      QUESTION_WORD_PATTERN.test(cleaned) ||
      cleaned.endsWith("?");

    const isMultiPart = parts.length > 1 && questionParts.length > 1;

    const isFollowUp = this.detectFollowUp(cleaned, previousQuestion);

    const isClarification = CLARIFICATION_PATTERN.test(cleaned);

    let confidence = 0;
    if (isNewQuestion) confidence += 0.4;
    if (isMultiPart) confidence += 0.2;
    if (isFollowUp) confidence += 0.2;
    if (isClarification) confidence += 0.1;
    confidence = Math.min(1, confidence);

    return Object.freeze({
      isNewQuestion,
      isMultiPart,
      parts: Object.freeze(questionParts.length > 0 ? questionParts : [cleaned]),
      isFollowUp,
      isClarification,
      confidence,
    });
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private empty(): QuestionBoundary {
    return Object.freeze({
      isNewQuestion: false,
      isMultiPart: false,
      parts: Object.freeze([]),
      isFollowUp: false,
      isClarification: false,
      confidence: 0,
    });
  }

  private splitParts(text: string): string[] {
    const raw = text.split(MULTI_PART_SPLIT).map((part) => part.trim()).filter((part) => part.length > 0);
    if (raw.length <= 1) {
      return raw;
    }
    return raw.slice(0, this.maxParts);
  }

  private isQuestionPart(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    if (t.endsWith("?")) return true;
    if (QUESTION_WORD_PATTERN.test(t)) return true;
    return false;
  }

  private detectFollowUp(text: string, previousQuestion?: string): boolean {
    if (!previousQuestion) return false;
    const t = text.trim().toLowerCase();
    if (FOLLOW_UP_PATTERN.test(t)) return true;
    // Short question utterances after a previous question are likely follow-ups.
    const words = t.split(/\s+/).length;
    if (words <= 10 && t.endsWith("?") && QUESTION_WORD_PATTERN.test(t)) return true;
    if (words <= 8 && /^(yes|no|ok|sure|really|and|but)\b/i.test(t)) return true;
    return false;
  }
}
