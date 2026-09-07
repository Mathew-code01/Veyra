// core/interview/SystemDesignEngine.ts

import type {
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

export class SystemDesignEngine {
  generate(input: InterviewEngineInput): AnswerGuidance {
    return {
      type: "system_design",

      headline:
        "Start with requirements, then progressively design the system.",

      sections: [
        {
          id: "requirements",
          title: "Requirements",
          content:
            "Clarify functional requirements, users, scale and important constraints.",
          priority: "primary",
        },
        {
          id: "assumptions",
          title: "Assumptions",
          content:
            "State traffic, storage, latency, availability and consistency assumptions.",
          priority: "primary",
        },
        {
          id: "architecture",
          title: "Architecture",
          content:
            "Describe the major services and how data flows between them.",
          priority: "primary",
        },
        {
          id: "data",
          title: "Data",
          content: "Choose storage technologies and explain the data model.",
          priority: "primary",
        },
        {
          id: "scaling",
          title: "Scaling",
          content:
            "Discuss caching, queues, partitioning, replicas and horizontal scaling.",
          priority: "secondary",
        },
        {
          id: "reliability",
          title: "Reliability",
          content:
            "Explain failure handling, observability, redundancy and recovery.",
          priority: "secondary",
        },
        {
          id: "tradeoffs",
          title: "Trade-offs",
          content: "Explain important architectural choices and alternatives.",
          priority: "primary",
        },
      ],

      talkingPoints: [
        "Clarify requirements first.",
        "State assumptions explicitly.",
        "Design the simplest viable architecture.",
        "Identify bottlenecks.",
        "Explain trade-offs.",
      ],

      cautions: [
        "Do not over-engineer before establishing requirements.",
        "Avoid naming technologies without explaining why.",
      ],

      confidence: 0.92,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}