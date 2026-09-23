import type { QuestionAnalysis } from "../../../shared/types/conversation";

const QUESTION_STARTERS = new Set([
  "what",
  "why",
  "how",
  "when",
  "where",
  "who",
  "which",
  "would",
  "could",
  "can",
  "will",
  "do",
  "does",
  "did",
  "have",
  "has",
  "are",
  "is",
]);

const QUESTION_PATTERNS: readonly RegExp[] = [
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bwould you\b/i,
  /\btell me\b/i,
  /\bwalk me through\b/i,
  /\bdescribe\b/i,
  /\bexplain\b/i,
  /\bhow did you\b/i,
  /\bwhy did you\b/i,
  /\bwhat did you\b/i,
  /\bwhat would you\b/i,
  /\bhow would you\b/i,
  /\bwhat is\b/i,
  /\bwhat are\b/i,
  /\bwhy is\b/i,
  /\bhow does\b/i,
  /\bhow do\b/i,
];

export class QuestionDetector {
  detect(text: string): QuestionAnalysis {
    const normalizedText = text.replace(/\s+/g, " ").trim();

    if (!normalizedText) {
      return {
        isQuestion: false,
        type: "unknown",
        normalizedText: "",
        confidence: 0,
        requiresCandidateAnswer: false,
        explicitQuestionMark: false,
        questionSignals: [],
      };
    }

    const lower = normalizedText.toLowerCase();

    const explicitQuestionMark = /[?؟]\s*$/.test(normalizedText);

    const firstWord = lower.split(/\s+/)[0];

    const starterMatch = QUESTION_STARTERS.has(firstWord);

    const patternMatches = QUESTION_PATTERNS.filter((pattern) =>
      pattern.test(lower),
    );

    const signals: string[] = [];

    if (explicitQuestionMark) {
      signals.push("question-mark");
    }

    if (starterMatch) {
      signals.push("question-starter");
    }

    if (patternMatches.length > 0) {
      signals.push("interrogative-pattern");
    }

    const confidence = this.calculateConfidence({
      explicitQuestionMark,
      starterMatch,
      patternCount: patternMatches.length,
      firstWord,
    });

    const isQuestion = normalizedText.length >= 3 && confidence >= 0.55;

    return {
      isQuestion,
      type: isQuestion ? "unknown" : "unknown",
      normalizedText,
      confidence,
      requiresCandidateAnswer: isQuestion,
      explicitQuestionMark,
      questionSignals: signals,
    };
  }

  private calculateConfidence(input: {
    readonly explicitQuestionMark: boolean;
    readonly starterMatch: boolean;
    readonly patternCount: number;
    readonly firstWord: string;
  }): number {
    let score = 0;

    if (input.explicitQuestionMark) {
      score += 0.45;
    }

    if (input.starterMatch) {
      score += 0.3;
    }

    if (input.patternCount > 0) {
      score += Math.min(0.35, input.patternCount * 0.15);
    }

    if (
      ["what", "why", "how", "when", "where", "who"].includes(input.firstWord)
    ) {
      score += 0.15;
    }

    return Math.min(1, score);
  }
}
