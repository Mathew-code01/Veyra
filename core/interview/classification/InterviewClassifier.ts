// core/interview/InterviewClassifier.ts

import type {
  ConversationAnalysis,
  QuestionType,
} from "../../shared/types/conversation";

import type {
  InterviewClassification,
  InterviewType,
} from "../../shared/types/interviews";

const QUESTION_TO_INTERVIEW: Partial<Record<QuestionType, InterviewType>> = {
  behavioral: "behavioral",
  technical: "technical",
  coding: "coding",
  system_design: "system_design",
  product: "product",
  case: "case",
  communication: "communication",
};

export class InterviewClassifier {
  classify(analysis: ConversationAnalysis): InterviewClassification {
    const questionType = analysis.question?.type;

    if (questionType && QUESTION_TO_INTERVIEW[questionType]) {
      const type = QUESTION_TO_INTERVIEW[questionType]!;

      return {
        type,
        confidence: Math.min(0.99, analysis.question?.confidence ?? 0.8),
        alternatives: [],
        signals: [`question-type:${questionType}`],
        questionType,
      };
    }

    return this.classifyFromText(analysis.turn.text);
  }

  private classifyFromText(text: string): InterviewClassification {
    const normalized = text.toLowerCase();

    const scores: Record<InterviewType, number> = {
      behavioral: 0,
      technical: 0,
      coding: 0,
      system_design: 0,
      product: 0,
      case: 0,
      communication: 0,
      mixed: 0,
      unknown: 0,
    };

    if (
      /tell me about a time|conflict|challenge|failure|leadership/i.test(
        normalized,
      )
    ) {
      scores.behavioral += 0.8;
    }

    if (/react|javascript|typescript|api|database|http/i.test(normalized)) {
      scores.technical += 0.75;
    }

    if (
      /implement|algorithm|function|complexity|array|tree|graph/i.test(
        normalized,
      )
    ) {
      scores.coding += 0.85;
    }

    if (
      /design a system|architecture|scale|distributed|queue|cache/i.test(
        normalized,
      )
    ) {
      scores.system_design += 0.9;
    }

    if (/product|user|metric|roadmap|prioritize/i.test(normalized)) {
      scores.product += 0.75;
    }

    if (/market|profit|revenue|market size|case/i.test(normalized)) {
      scores.case += 0.75;
    }

    if (/communicate|explain to a non/i.test(normalized)) {
      scores.communication += 0.7;
    }

    const ranked = (Object.entries(scores) as Array<[InterviewType, number]>)
      .filter(([type]) => type !== "unknown" && type !== "mixed")
      .sort((a, b) => b[1] - a[1]);

    const best = ranked[0];

    if (!best || best[1] === 0) {
      return {
        type: "unknown",
        confidence: 0.2,
        alternatives: [],
        signals: [],
      };
    }

    return {
      type: best[0],
      confidence: Math.min(0.95, best[1]),
      alternatives: ranked.slice(1, 3).map(([type, confidence]) => ({
        type,
        confidence,
      })),
      signals: [`text:${best[0]}`],
    };
  }
}