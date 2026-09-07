// core/conversation/QuestionDetector.ts

import type { QuestionAnalysis } from "../../shared/types/conversation";

const QUESTION_STARTERS = [
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
  "tell me",
  "describe",
  "walk me through",
  "explain",
];

const QUESTION_PATTERNS = [
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bwould you\b/i,
  /\btell me about\b/i,
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
    const normalized = this.normalize(text);

    if (!normalized) {
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

    const explicitQuestionMark = /[?؟]\s*$/.test(text.trim());

    const firstWord = normalized.split(/\s+/)[0];

    const starterMatch = QUESTION_STARTERS.some(
      (starter) =>
        normalized === starter || normalized.startsWith(`${starter} `),
    );

    const patternMatches = QUESTION_PATTERNS.filter((pattern) =>
      pattern.test(normalized),
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

    const isQuestion = confidence >= 0.55 && normalized.length >= 3;

    return {
      isQuestion,
      type: isQuestion ? "general" : "unknown",
      normalizedText: normalized,
      confidence,
      requiresCandidateAnswer: isQuestion,
      explicitQuestionMark,
      questionSignals: signals,
    };
  }

  private calculateConfidence(input: {
    explicitQuestionMark: boolean;
    starterMatch: boolean;
    patternCount: number;
    firstWord: string;
  }): number {
    let score = 0;

    if (input.explicitQuestionMark) score += 0.45;
    if (input.starterMatch) score += 0.3;
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

  private normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }
}