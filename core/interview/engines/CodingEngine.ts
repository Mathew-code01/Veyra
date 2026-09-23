// core/interview/CodingEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class CodingEngine {
  generate(input: InterviewEngineInput): AnswerGuidance {
    return {
      type: "coding",

      headline: "Clarify the problem before proposing an algorithm.",

      sections: [
        {
          id: "interpretation",
          title: "Interpretation",
          content:
            "Restate the problem and identify inputs, outputs and constraints.",
          priority: "primary",
        },
        {
          id: "approach",
          title: "Approach",
          content: "Describe the algorithm and why it works.",
          priority: "primary",
        },
        {
          id: "implementation",
          title: "Implementation",
          content: "Translate the approach into clean, readable code.",
          priority: "primary",
        },
        {
          id: "complexity",
          title: "Complexity",
          content: "State time and space complexity and justify both.",
          priority: "primary",
        },
        {
          id: "edge-cases",
          title: "Edge Cases",
          content:
            "Consider empty input, boundaries, duplicates and invalid cases where relevant.",
          priority: "secondary",
        },
      ],

      talkingPoints: [
        "Clarify ambiguous requirements.",
        "Start with a simple correct approach.",
        "Explain the optimization.",
        "Walk through a small example.",
        "State complexity explicitly.",
      ],

      cautions: [
        "Do not jump directly into code.",
        "Verify edge cases before finalizing.",
      ],

      confidence: 0.9,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}