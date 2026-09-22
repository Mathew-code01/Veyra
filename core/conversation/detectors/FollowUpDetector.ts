// core/conversation/FollowUpDetector.ts

import type {
  ConversationTurn,
  FollowUpAnalysis,
} from "../../shared/types/conversation";

const FOLLOW_UP_PATTERNS = [
  /^why\b/i,
  /^how\b/i,
  /^what about\b/i,
  /^and what\b/i,
  /^can you elaborate\b/i,
  /^could you elaborate\b/i,
  /^tell me more\b/i,
  /^what do you mean\b/i,
  /^how so\b/i,
  /^what happened next\b/i,
  /^what was the result\b/i,
  /^what would you change\b/i,
];

export class FollowUpDetector {
  detect(
    current: ConversationTurn,
    previousQuestion?: ConversationTurn,
  ): FollowUpAnalysis {
    if (current.speaker !== "interviewer" || !current.question?.isQuestion) {
      return {
        isFollowUp: false,
        confidence: 0,
        relationship: "none",
      };
    }

    if (!previousQuestion) {
      return {
        isFollowUp: false,
        confidence: 0,
        relationship: "none",
      };
    }

    const text = current.text.trim();

    const lexicalSignal = FOLLOW_UP_PATTERNS.some((pattern) =>
      pattern.test(text),
    );

    const overlap = this.tokenOverlap(text, previousQuestion.text);

    const shortQuestion = text.split(/\s+/).length <= 10;

    let confidence = 0;

    if (lexicalSignal) confidence += 0.5;
    if (overlap > 0.2) confidence += 0.2;
    if (shortQuestion) confidence += 0.1;

    const sameTopic =
      current.topic?.topic &&
      previousQuestion.topic?.topic &&
      current.topic.topic === previousQuestion.topic.topic;

    if (sameTopic) confidence += 0.2;

    confidence = Math.min(1, confidence);

    const isFollowUp = confidence >= 0.55;

    return {
      isFollowUp,
      confidence,
      parentQuestionId: isFollowUp ? previousQuestion.id : undefined,
      relationship: isFollowUp ? this.determineRelationship(text) : "none",
    };
  }

  private determineRelationship(
    text: string,
  ): FollowUpAnalysis["relationship"] {
    if (/what do you mean|elaborate|clarify/i.test(text)) {
      return "clarifying";
    }

    if (/why|how/i.test(text)) {
      return "deepening";
    }

    if (/what would you change|are you sure|why not/i.test(text)) {
      return "challenging";
    }

    return "direct";
  }

  private tokenOverlap(first: string, second: string): number {
    const a = new Set(this.tokens(first));
    const b = new Set(this.tokens(second));

    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;

    for (const token of a) {
      if (b.has(token)) intersection++;
    }

    return intersection / Math.max(a.size, b.size);
  }

  private tokens(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((token) => token.length >= 3);
  }
}