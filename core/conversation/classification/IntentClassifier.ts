import type {
  IntentAnalysis,
  SpeakerRole,
} from "../../../shared/types/conversation";

export interface IntentClassificationInput {
  readonly text: string;
  readonly isQuestion: boolean;
  readonly isFollowUp: boolean;
  readonly isClarification: boolean;
  readonly speaker: SpeakerRole;
}

export class IntentClassifier {
  classify(input: IntentClassificationInput): IntentAnalysis {
    const text = input.text.trim();

    if (input.isClarification) {
      return {
        intent: "clarification",
        confidence: 0.96,
        signals: ["clarification"],
      };
    }

    if (input.isFollowUp) {
      return {
        intent: "follow_up",
        confidence: 0.94,
        signals: ["follow-up"],
      };
    }

    if (input.isQuestion) {
      return {
        intent: "question",
        confidence: 0.91,
        signals: ["question"],
      };
    }

    if (
      /\b(okay|ok|thanks|thank you|got it|understood|sure|right|great)\b/i.test(
        text,
      )
    ) {
      return {
        intent: "acknowledgement",
        confidence: 0.86,
        signals: ["acknowledgement"],
      };
    }

    if (
      /\b(actually|rather|correction|to correct|that's not|that is not)\b/i.test(
        text,
      )
    ) {
      return {
        intent: "correction",
        confidence: 0.82,
        signals: ["correction"],
      };
    }

    if (
      /\b(please|let's|let us|you need to|your task is|can you)\b/i.test(text)
    ) {
      return {
        intent: "task",
        confidence: 0.72,
        signals: ["task-language"],
      };
    }

    if (input.speaker === "candidate") {
      return {
        intent: "answer",
        confidence: 0.74,
        signals: ["candidate-response"],
      };
    }

    return {
      intent: "statement",
      confidence: 0.68,
      signals: ["statement"],
    };
  }
}
