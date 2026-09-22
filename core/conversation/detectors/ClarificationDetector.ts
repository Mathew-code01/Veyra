// core/conversation/ClarificationDetector.ts

import type { ClarificationAnalysis } from "../../shared/types/conversation";

const PATTERNS = [
  /\bwhat do you mean\b/i,
  /\bcan you clarify\b/i,
  /\bcould you clarify\b/i,
  /\bcan you explain that\b/i,
  /\bwhat exactly do you mean\b/i,
  /\bto clarify\b/i,
  /\bjust to clarify\b/i,
  /\bwhen you say\b/i,
  /\bdo you mean\b/i,
];

export class ClarificationDetector {
  detect(text: string): ClarificationAnalysis {
    const normalized = text.replace(/\s+/g, " ").trim();

    const matches = PATTERNS.filter((pattern) => pattern.test(normalized));

    if (matches.length === 0) {
      return {
        isClarification: false,
        confidence: 0,
      };
    }

    return {
      isClarification: true,
      confidence: Math.min(0.98, 0.7 + matches.length * 0.1),
      target: this.extractTarget(normalized),
    };
  }

  private extractTarget(text: string): string | undefined {
    const match = text.match(/\b(?:when you say|do you mean)\s+(.+)/i);

    return match?.[1]?.trim();
  }
}