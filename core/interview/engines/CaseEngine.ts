// core/interview/CaseEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class CaseEngine {
  generate(input: InterviewEngineInput): AnswerGuidance {
    return {
      type: "case",

      headline:
        "Clarify the objective, establish a framework and test the highest-impact assumptions.",

      sections: [
        {
          id: "clarification",
          title: "Clarification",
          content: "Confirm the objective, scope and success criteria.",
          priority: "primary",
        },
        {
          id: "framework",
          title: "Framework",
          content: "Break the problem into mutually useful analytical areas.",
          priority: "primary",
        },
        {
          id: "assumptions",
          title: "Assumptions",
          content: "State assumptions clearly and estimate where necessary.",
          priority: "primary",
        },
        {
          id: "analysis",
          title: "Analysis",
          content: "Analyze the largest drivers and test hypotheses.",
          priority: "primary",
        },
        {
          id: "recommendation",
          title: "Recommendation",
          content: "Give a clear recommendation supported by the analysis.",
          priority: "primary",
        },
      ],

      talkingPoints: [
        "Clarify the objective.",
        "Build a logical framework.",
        "State assumptions.",
        "Prioritize the biggest drivers.",
        "Conclude with a recommendation.",
      ],

      cautions: ["Do not perform calculations without explaining assumptions."],

      confidence: 0.84,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}