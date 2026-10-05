// ============================================================================
// FILE: core/interview/answer/AnswerBuilder.ts
//
// PURPOSE:
// Converts InterviewAnalysis/classification into structured interview
// guidance.
//
// IMPORTANT:
//
// This class does NOT classify the interview.
//
// InterviewClassifier answers:
//     "What kind of interview/task is happening?"
//
// AnswerBuilder answers:
//     "Given that classification, what structured guidance is appropriate?"
//
// Final natural-language answer generation belongs to core/ai.
// ============================================================================

import type {
  InterviewAnalysis,
  InterviewAnswerGuidance,
} from "../../../shared/types/interviews";

import { BehavioralEngine } from "../engines/BehavioralEngine";
import { TechnicalEngine } from "../engines/TechnicalEngine";
import { CodingEngine } from "../engines/CodingEngine";
import { SystemDesignEngine } from "../engines/SystemDesignEngine";
import { ProductEngine } from "../engines/ProductEngine";
import { CaseEngine } from "../engines/CaseEngine";
import { CommunicationEngine } from "../engines/CommunicationEngine";

export class AnswerBuilder {
  private readonly behavioral = new BehavioralEngine();

  private readonly technical = new TechnicalEngine();

  private readonly coding = new CodingEngine();

  private readonly systemDesign = new SystemDesignEngine();

  private readonly product = new ProductEngine();

  private readonly caseEngine = new CaseEngine();

  private readonly communication = new CommunicationEngine();

  public build(analysis: InterviewAnalysis): InterviewAnswerGuidance {
    const input = {
      analysis,
    };

    switch (analysis.classification.type) {
      case "behavioral":
        return this.behavioral.generate(input);

      case "technical":
        return this.technical.generate(input);

      case "coding":
        return this.coding.generate(input);

      case "system_design":
        return this.systemDesign.generate(input);

      case "product":
        return this.product.generate(input);

      case "case":
        return this.caseEngine.generate(input);

      case "communication":
        return this.communication.generate(input);

      case "mixed":
      case "unknown":
      default:
        return this.buildGeneric(analysis);
    }
  }

  private buildGeneric(analysis: InterviewAnalysis): InterviewAnswerGuidance {
    return {
      type: analysis.classification.type,

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

      confidence: Math.min(0.9, analysis.classification.confidence),

      sourceQuestion: analysis.conversation.turn.text,
    };
  }
}
