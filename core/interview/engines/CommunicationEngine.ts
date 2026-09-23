// core/interview/CommunicationEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class CommunicationEngine {
  generate(input: InterviewEngineInput): AnswerGuidance {
    return {
      type: "communication",

      headline: "Lead with the conclusion, then explain it clearly.",

      sections: [
        {
          id: "answer",
          title: "Direct Answer",
          content: "Give the main answer before providing supporting detail.",
          priority: "primary",
        },
        {
          id: "reasoning",
          title: "Reasoning",
          content: "Explain the reasoning in a logical sequence.",
          priority: "primary",
        },
        {
          id: "example",
          title: "Example",
          content: "Use a concrete example where it improves understanding.",
          priority: "secondary",
        },
        {
          id: "summary",
          title: "Summary",
          content: "End with the key takeaway.",
          priority: "secondary",
        },
      ],

      talkingPoints: [
        "Lead with the conclusion.",
        "Use short logical sections.",
        "Avoid unnecessary jargon.",
        "Check that the explanation answers the actual question.",
      ],

      cautions: ["Do not over-explain simple concepts."],

      confidence: 0.82,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}