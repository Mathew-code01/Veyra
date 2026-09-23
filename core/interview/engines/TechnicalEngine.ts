// core/interview/TechnicalEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class TechnicalEngine {
  generate(
    input: InterviewEngineInput,
  ): AnswerGuidance {
    return {
      type: "technical",

      headline:
        "Explain the concept, implementation and trade-offs.",

      sections: [
        {
          id: "concept",
          title: "Concept",
          content:
            "Start with a precise definition in one or two sentences.",
          priority: "primary",
        },
        {
          id: "implementation",
          title: "Implementation",
          content:
            "Explain how it works internally or how you would implement it.",
          priority: "primary",
        },
        {
          id: "example",
          title: "Example",
          content:
            "Give a concrete example relevant to the question.",
          priority: "secondary",
        },
        {
          id: "tradeoffs",
          title: "Trade-offs",
          content:
            "Discuss advantages, limitations and when you would choose another approach.",
          priority: "primary",
        },
      ],

      talkingPoints: [
        "Define the concept first.",
        "Connect theory to implementation.",
        "Use a concrete example.",
        "Mention important trade-offs.",
      ],

      cautions: [
        "Avoid unnecessary jargon.",
        "Do not state uncertain implementation details as facts.",
      ],

      confidence: 0.85,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}