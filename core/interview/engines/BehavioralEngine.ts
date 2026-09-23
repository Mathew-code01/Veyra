// core/interview/BehavioralEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class BehavioralEngine {
  generate(input: InterviewEngineInput): AnswerGuidance {
    const question = input.analysis.turn.text;

    const story = input.candidateContext?.stories?.[0];

    return {
      type: "behavioral",

      headline: "Answer this with a concise STAR story.",

      sections: [
        {
          id: "situation",
          title: "Situation",
          content:
            story ?? "Briefly establish the relevant context and challenge.",
          priority: "primary",
        },
        {
          id: "task",
          title: "Task",
          content: "Explain your specific responsibility.",
          priority: "primary",
        },
        {
          id: "action",
          title: "Action",
          content:
            "Focus on what you personally did, including decisions and reasoning.",
          priority: "primary",
        },
        {
          id: "result",
          title: "Result",
          content:
            "Give a measurable result where possible and explain what you learned.",
          priority: "primary",
        },
      ],

      talkingPoints: [
        "Keep the story specific.",
        "Use first-person ownership.",
        "Quantify the result where possible.",
        "Avoid unnecessary background.",
      ],

      cautions: [
        "Do not invent an experience.",
        "Do not claim ownership of team work you did not perform.",
      ],

      confidence: 0.86,
      sourceQuestion: question,
    };
  }
}