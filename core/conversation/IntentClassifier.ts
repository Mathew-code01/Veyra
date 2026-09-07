// core/conversation/IntentClassifier.ts

import type {
  IntentAnalysis,
} from "../../shared/types/conversation";

export class IntentClassifier {
  classify(input: {
    text: string;
    isQuestion: boolean;
    isFollowUp: boolean;
    isClarification: boolean;
    speaker: "interviewer" | "candidate" | "unknown";
  }): IntentAnalysis {
    if (input.isClarification) {
      return {
        intent: "clarification",
        confidence: 0.95,
        signals: ["clarification"],
      };
    }

    if (input.isFollowUp) {
      return {
        intent: "follow_up",
        confidence: 0.93,
        signals: ["follow-up"],
      };
    }

    if (input.isQuestion) {
      return {
        intent: "question",
        confidence: 0.9,
        signals: ["question"],
      };
    }

    const acknowledgement =
      /\b(okay|okay thanks|got it|understood|sure|right|great)\b/i.test(
        input.text,
      );

    if (acknowledgement) {
      return {
        intent: "acknowledgement",
        confidence: 0.85,
        signals: ["acknowledgement"],
      };
    }

    if (input.speaker === "candidate") {
      return {
        intent: "answer",
        confidence: 0.75,
        signals: ["candidate-response"],
      };
    }

    return {
      intent: "statement",
      confidence: 0.7,
      signals: ["statement"],
    };
  }
}