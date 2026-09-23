// core/interview/AnswerBuilder.ts

import type {
  AnswerBuilderInput,
  AnswerGuidance,
  InterviewEngineInput,
} from "../../shared/types/interviews";

import { BehavioralEngine } from "./BehavioralEngine";
import { TechnicalEngine } from "./TechnicalEngine";
import { CodingEngine } from "./CodingEngine";
import { SystemDesignEngine } from "./SystemDesignEngine";
import { ProductEngine } from "./ProductEngine";
import { CaseEngine } from "./CaseEngine";
import { CommunicationEngine } from "./CommunicationEngine";

export class AnswerBuilder {
  private readonly behavioral = new BehavioralEngine();

  private readonly technical = new TechnicalEngine();

  private readonly coding = new CodingEngine();

  private readonly systemDesign = new SystemDesignEngine();

  private readonly product = new ProductEngine();

  private readonly caseEngine = new CaseEngine();

  private readonly communication = new CommunicationEngine();

  build(input: AnswerBuilderInput): AnswerGuidance {
    const engineInput: InterviewEngineInput = {
      analysis: input.analysis,
      candidateContext: input.candidateContext,
      jobContext: input.jobContext,
    };

    switch (input.classification.type) {
      case "behavioral":
        return this.behavioral.generate(engineInput);

      case "technical":
        return this.technical.generate(engineInput);

      case "coding":
        return this.coding.generate(engineInput);

      case "system_design":
        return this.systemDesign.generate(engineInput);

      case "product":
        return this.product.generate(engineInput);

      case "case":
        return this.caseEngine.generate(engineInput);

      case "communication":
        return this.communication.generate(engineInput);

      default:
        return this.buildGeneric(engineInput);
    }
  }

  private buildGeneric(input: InterviewEngineInput): AnswerGuidance {
    return {
      type: "unknown",

      headline:
        "Answer the question directly and support the response with relevant evidence.",

      sections: [
        {
          id: "answer",
          title: "Direct Answer",
          content: "Answer the specific question first.",
          priority: "primary",
        },
        {
          id: "support",
          title: "Supporting Detail",
          content: "Provide the most relevant evidence, example or reasoning.",
          priority: "secondary",
        },
      ],

      talkingPoints: [
        "Answer the actual question.",
        "Keep the response concise.",
        "Use evidence from real experience where appropriate.",
      ],

      cautions: ["Avoid inventing experience or unsupported claims."],

      confidence: 0.5,
      sourceQuestion: input.analysis.turn.text,
    };
  }
}