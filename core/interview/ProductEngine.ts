// core/interview/ProductEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class ProductEngine {
  generate(input: InterviewEngineInput): AnswerGuidance {
    return {
      type: "product",

      headline:
        "Frame the problem around users, outcomes and measurable impact.",

      sections: [
        {
          id: "user",
          title: "User",
          content: "Identify the target user and their most important need.",
          priority: "primary",
        },
        {
          id: "problem",
          title: "Problem",
          content: "Define the problem and why it matters.",
          priority: "primary",
        },
        {
          id: "hypothesis",
          title: "Hypothesis",
          content: "Explain the proposed solution or product hypothesis.",
          priority: "primary",
        },
        {
          id: "metrics",
          title: "Metrics",
          content: "Define success metrics and guardrail metrics.",
          priority: "primary",
        },
        {
          id: "tradeoffs",
          title: "Trade-offs",
          content: "Discuss prioritization, constraints and alternatives.",
          priority: "secondary",
        },
      ],

      talkingPoints: [
        "Start with the user.",
        "Define the problem before the feature.",
        "Prioritize based on impact.",
        "Define measurable success.",
      ],

      cautions: ["Do not optimize a metric without considering user impact."],

      confidence: 0.86,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}