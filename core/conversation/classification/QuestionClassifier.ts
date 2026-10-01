// core/conversation/classification/QuestionClassifier.ts

import type {
  ConversationQuestionType,
  QuestionAnalysis,
} from "../../../shared/types/conversation";

export class QuestionClassifier {
  classify(input: QuestionAnalysis): QuestionAnalysis {
    if (!input.isQuestion) {
      return input;
    }

    const text = input.normalizedText.trim().toLowerCase();

    const type = this.classifyType(text);

    return {
      ...input,
      type,
      requiresResponse: this.requiresResponse(type),
    };
  }

  private classifyType(text: string): ConversationQuestionType {
    // Clarification should take precedence over generic requests/questions.
    if (
      /\b(clarify|clarification|what do you mean|do you mean|can you clarify|could you clarify)\b/i.test(
        text,
      )
    ) {
      return "clarification";
    }

    // Requests such as "Can you explain..." are requests, not yes/no
    // questions simply because they begin with "can".
    if (
      /\b(show me|give me|provide|tell me|describe|explain|walk me through|can you explain|could you explain)\b/i.test(
        text,
      )
    ) {
      return "request";
    }

    if (/\b(or|either|which one|which)\b/i.test(text)) {
      return "choice";
    }

    if (
      /\b(confirm|confirmation|correct me|is that right|right\?)\b/i.test(text)
    ) {
      return "confirmation";
    }

    if (/^(can|could|would|will|do|does|did|is|are|have|has)\b/i.test(text)) {
      return "yes_no";
    }

    if (/^(what|why|how|when|where|who)\b/i.test(text)) {
      return "open_ended";
    }

    return "unknown";
  }

  private requiresResponse(type: ConversationQuestionType): boolean {
    return type !== "unknown";
  }
}
