// core/conversation/TopicTracker.ts

import type {
  ConversationTurn,
  TopicAnalysis,
} from "../../shared/types/conversation";

const TOPIC_RULES: Array<{
  topic: string;
  keywords: string[];
}> = [
  {
    topic: "resume",
    keywords: ["resume", "cv", "background", "experience", "career"],
  },
  {
    topic: "leadership",
    keywords: ["lead", "leadership", "team", "manager", "mentor"],
  },
  {
    topic: "react",
    keywords: ["react", "component", "hooks", "jsx", "frontend"],
  },
  {
    topic: "backend",
    keywords: ["backend", "node", "express", "server", "api"],
  },
  {
    topic: "database",
    keywords: ["database", "postgres", "mongodb", "sql", "query"],
  },
  {
    topic: "system-design",
    keywords: [
      "architecture",
      "scale",
      "distributed",
      "cache",
      "queue",
      "load balancer",
    ],
  },
  {
    topic: "coding",
    keywords: [
      "algorithm",
      "function",
      "array",
      "tree",
      "graph",
      "complexity",
      "code",
    ],
  },
  {
    topic: "product",
    keywords: ["product", "user", "metric", "feature", "roadmap"],
  },
];

export class TopicTracker {
  track(current: ConversationTurn, previous?: TopicAnalysis): TopicAnalysis {
    const text = current.text.toLowerCase();

    const candidates = TOPIC_RULES.map((rule) => {
      const matched = rule.keywords.filter((keyword) => text.includes(keyword));

      return {
        ...rule,
        matched,
        score: matched.length / Math.max(rule.keywords.length, 1),
      };
    })
      .filter((item) => item.matched.length > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return {
        topic: previous?.topic ?? "general",
        confidence: previous ? Math.max(0.35, previous.confidence * 0.85) : 0.3,
        changeType: "none",
        previousTopic: previous?.topic,
        keywords: [],
      };
    }

    const best = candidates[0];

    const topicChanged = Boolean(previous) && previous?.topic !== best.topic;

    return {
      topic: best.topic,
      confidence: Math.min(0.98, 0.55 + best.matched.length * 0.1),
      changeType: topicChanged ? "new_topic" : "none",
      previousTopic: previous?.topic,
      keywords: best.matched,
    };
  }
}