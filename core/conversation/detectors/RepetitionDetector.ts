// core/conversation/RepetitionDetector.ts

import type {
  ConversationTurn,
  RepetitionAnalysis,
} from "../../shared/types/conversation";

export class RepetitionDetector {
  detect(
    current: ConversationTurn,
    previousQuestions: ConversationTurn[],
  ): RepetitionAnalysis {
    if (current.speaker !== "interviewer" || !current.question?.isQuestion) {
      return {
        isRepeated: false,
        confidence: 0,
        similarity: 0,
      };
    }

    let bestSimilarity = 0;
    let bestMatch: ConversationTurn | undefined;

    for (const question of previousQuestions) {
      if (question.id === current.id) continue;

      const similarity = this.similarity(current.text, question.text);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = question;
      }
    }

    const repeated = bestSimilarity >= 0.78;

    return {
      isRepeated: repeated,
      confidence: repeated
        ? Math.min(0.99, bestSimilarity + 0.1)
        : bestSimilarity,
      matchedQuestionId: repeated ? bestMatch?.id : undefined,
      similarity: bestSimilarity,
    };
  }

  private similarity(first: string, second: string): number {
    const a = this.ngrams(first);
    const b = this.ngrams(second);

    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;

    for (const value of a) {
      if (b.has(value)) intersection++;
    }

    return intersection / Math.max(a.size, b.size);
  }

  private ngrams(text: string): Set<string> {
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);

    const result = new Set<string>();

    for (let i = 0; i < tokens.length - 1; i++) {
      result.add(`${tokens[i]} ${tokens[i + 1]}`);
    }

    if (result.size === 0) {
      tokens.forEach((token) => result.add(token));
    }

    return result;
  }
}