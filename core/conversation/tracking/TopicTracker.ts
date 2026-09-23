import type {
  ConversationTurn,
  TopicAnalysis,
} from "../../../shared/types/conversation";

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "this",
  "that",
  "it",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "my",
  "your",
  "our",
  "their",
  "what",
  "why",
  "how",
  "when",
  "where",
  "who",
]);

export class TopicTracker {
  track(current: ConversationTurn, previous?: TopicAnalysis): TopicAnalysis {
    const keywords = this.extractKeywords(current.text);

    if (keywords.length === 0) {
      return {
        topic: previous?.topic ?? "general",
        confidence: previous ? Math.max(0.3, previous.confidence * 0.85) : 0.3,
        changeType: "none",
        previousTopic: previous?.topic,
        keywords: [],
      };
    }

    const topic = this.buildTopic(keywords);

    const previousTopic = previous?.topic;

    if (!previousTopic) {
      return {
        topic,
        confidence: 0.55,
        changeType: "new_topic",
        keywords,
      };
    }

    if (previousTopic === topic) {
      return {
        topic,
        confidence: Math.min(0.95, previous.confidence + 0.05),
        changeType: "none",
        previousTopic,
        keywords,
      };
    }

    const related = this.isRelated(previousTopic, keywords);

    return {
      topic,
      confidence: related ? 0.65 : 0.78,
      changeType: related ? "subtopic" : "new_topic",
      previousTopic,
      keywords,
    };
  }

  private extractKeywords(text: string): string[] {
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);

    const frequency = new Map<string, number>();

    for (const token of tokens) {
      if (token.length < 3 || STOP_WORDS.has(token)) {
        continue;
      }

      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }

    return [...frequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([token]) => token);
  }

  private buildTopic(keywords: readonly string[]): string {
    return keywords.slice(0, 3).join("-");
  }

  private isRelated(
    previousTopic: string,
    keywords: readonly string[],
  ): boolean {
    const previousTokens = new Set(previousTopic.split("-"));

    return keywords.some((keyword) => previousTokens.has(keyword));
  }
}
