
// ============================================================================
// FILE: core/interview/classification/InterviewClassifier.ts
//
// PURPOSE:
// Deterministically classify the interview/task type from ConversationAnalysis.
//
// IMPORTANT:
//
// This classifier does NOT decide:
// - what the candidate's actual experience is
// - whether a candidate claim is true
// - what answer should be factually generated
//
// It only identifies the likely interview/task category.
// ============================================================================

import type { InterviewClassifier as InterviewClassifierContract } from "../contracts/InterviewClassifier";

import type {
  InterviewClassification,
  InterviewClassificationAlternative,
} from "../../../shared/types/interviews";

import type { ConversationAnalysis } from "../../../shared/types/conversation";

import type { InterviewType } from "../../../shared/constants/interviewTypes";

const TYPE_PATTERNS: Readonly<
  Record<InterviewType, readonly RegExp[]>
> = {
  behavioral: [
    /\btell me about a time\b/i,
    /\bdescribe a time\b/i,
    /\bhow did you handle\b/i,
    /\bhow have you handled\b/i,
    /\bconflict\b/i,
    /\bdisagreement\b/i,
    /\bteam\b/i,
    /\bleadership\b/i,
    /\bmistake\b/i,
    /\bfailure\b/i,
    /\bchallenge\b/i,
    /\bfeedback\b/i,
  ],

  technical: [
    /\bwhat is\b/i,
    /\bhow does\b/i,
    /\bhow do\b/i,
    /\bexplain\b/i,
    /\binterface\b/i,
    /\bapi\b/i,
    /\bdatabase\b/i,
    /\btypescript\b/i,
    /\bjavascript\b/i,
    /\bpython\b/i,
    /\breact\b/i,
    /\bnode\b/i,
    /\btesting\b/i,
    /\bdebug\b/i,
    /\bperformance\b/i,
    /\bcaching\b/i,
    /\bconcurrency\b/i,
  ],

  coding: [
    /\bwrite (?:some )?code\b/i,
    /\bwrite a function\b/i,
    /\bimplement\b/i,
    /\bcode\b/i,
    /\balgorithm\b/i,
    /\bdata structure\b/i,
    /\bsolve this\b/i,
    /\bleetcode\b/i,
    /\bcomplexity\b/i,
    /\bbig[- ]?o\b/i,
    /\bdebug this\b/i,
  ],

  system_design: [
    /\bsystem design\b/i,
    /\bdesign a system\b/i,
    /\bdesign an? application\b/i,
    /\barchitecture\b/i,
    /\bscalab(?:le|ility)\b/i,
    /\bdistributed\b/i,
    /\bhigh availability\b/i,
    /\bload balanc(?:er|ing)\b/i,
    /\bmessage queue\b/i,
    /\bservice architecture\b/i,
    /\bmicroservices\b/i,
  ],

  case: [
    /\bcase study\b/i,
    /\bcase interview\b/i,
    /\bmarket size\b/i,
    /\bmarket sizing\b/i,
    /\bprofit\b/i,
    /\brevenue\b/i,
    /\bcost\b/i,
    /\bdeclining\b/i,
    /\bdiagnose\b/i,
    /\broot cause\b/i,
  ],

  product: [
    /\bproduct\b/i,
    /\bproduct manager\b/i,
    /\bprioriti[sz]e\b/i,
    /\broadmap\b/i,
    /\buser needs?\b/i,
    /\buser problem\b/i,
    /\bproduct metric\b/i,
    /\bfeature\b/i,
    /\bproduct strategy\b/i,
  ],

  communication: [
    /\bexplain this\b/i,
    /\bexplain it\b/i,
    /\bcommunicat/i,
    /\bpresent\b/i,
    /\bhow would you explain\b/i,
    /\bnon[- ]technical\b/i,
    /\bstakeholder\b/i,
  ],

  experience: [
    /\byour experience\b/i,
    /\bbackground\b/i,
    /\bcareer\b/i,
    /\bprevious role\b/i,
    /\bprevious job\b/i,
    /\bprojects?\b/i,
    /\bwork history\b/i,
    /\bwhat have you built\b/i,
    /\btell me about yourself\b/i,
  ],

  motivation: [
    /\bwhy do you want\b/i,
    /\bwhy are you interested\b/i,
    /\bwhy this role\b/i,
    /\bwhy this company\b/i,
    /\bwhy us\b/i,
    /\bcareer goals?\b/i,
    /\bmotivated\b/i,
    /\bmotivation\b/i,
  ],

  situational: [
    /\bwhat would you do\b/i,
    /\bhow would you handle\b/i,
    /\bsuppose\b/i,
    /\bimagine\b/i,
    /\bif you were\b/i,
    /\bscenario\b/i,
    /\bhypothetically\b/i,
  ],

  general: [],
};

export class InterviewClassifier
  implements InterviewClassifierContract
{
  public classify(
    analysis: ConversationAnalysis,
  ): InterviewClassification {
    const text = analysis.turn.text.trim();

    if (!text) {
      return this.generalClassification(analysis);
    }

    const scores = new Map<InterviewType, number>();

    for (const type of Object.keys(TYPE_PATTERNS) as InterviewType[]) {
      scores.set(type, 0);
    }

    for (const type of Object.keys(TYPE_PATTERNS) as InterviewType[]) {
      const patterns = TYPE_PATTERNS[type];

      for (const pattern of patterns) {
        if (pattern.test(text)) {
          scores.set(type, (scores.get(type) ?? 0) + 1);
        }
      }
    }

    this.applyConversationSignals(scores, analysis);

    const ranked = [...scores.entries()]
      .filter(([type]) => type !== "general")
      .sort((a, b) => b[1] - a[1]);

    const top = ranked[0];

    if (!top || top[1] <= 0) {
      return this.generalClassification(analysis);
    }

    const second = ranked[1];

    const total =
      ranked.reduce((sum, [, score]) => sum + score, 0) || 1;

    const confidence = this.clamp(
      0.45 + (top[1] / total) * 0.5,
    );

    const alternatives: InterviewClassificationAlternative[] = [];

    if (second && second[1] > 0) {
      alternatives.push({
        type: second[0],
        confidence: this.clamp(second[1] / total),
      });
    }

    const signals = this.buildSignals(top[0], text, analysis);

    return {
      type: top[0],
      confidence,
      alternatives,
      signals,
      questionType: analysis.question.type,
    };
  }

  private applyConversationSignals(
    scores: Map<InterviewType, number>,
    analysis: ConversationAnalysis,
  ): void {
    if (analysis.question.isQuestion) {
      this.add(scores, "general", 0.25);
    }

    if (analysis.intent.intent === "clarification") {
      this.add(scores, "communication", 0.5);
    }

    if (analysis.intent.intent === "follow_up") {
      this.add(scores, "general", 0.2);
    }

    if (analysis.topic.topic) {
      const topic = analysis.topic.topic.toLowerCase();

      if (
        /\b(code|coding|algorithm|programming|typescript|javascript)\b/.test(
          topic,
        )
      ) {
        this.add(scores, "coding", 1);
      }

      if (
        /\b(system|architecture|distributed|scaling)\b/.test(
          topic,
        )
      ) {
        this.add(scores, "system_design", 1);
      }

      if (/\bproduct\b/.test(topic)) {
        this.add(scores, "product", 1);
      }
    }
  }

  private buildSignals(
    type: InterviewType,
    text: string,
    analysis: ConversationAnalysis,
  ): readonly string[] {
    const signals: string[] = [];

    signals.push(`type:${type}`);

    if (analysis.question.isQuestion) {
      signals.push("conversation:question");
    }

    if (analysis.question.explicitQuestionMark) {
      signals.push("conversation:explicit-question-mark");
    }

    if (analysis.followUp.isFollowUp) {
      signals.push("conversation:follow-up");
    }

    if (analysis.clarification.isClarification) {
      signals.push("conversation:clarification");
    }

    if (analysis.topic.topic) {
      signals.push(`topic:${analysis.topic.topic}`);
    }

    for (const pattern of TYPE_PATTERNS[type]) {
      if (pattern.test(text)) {
        signals.push(`pattern:${pattern.source}`);
      }
    }

    return signals;
  }

  private generalClassification(
    analysis: ConversationAnalysis,
  ): InterviewClassification {
    return {
      type: "general",
      confidence: analysis.question.isQuestion ? 0.55 : 0.35,
      alternatives: [],
      signals: [
        "type:general",
        analysis.question.isQuestion
          ? "conversation:question"
          : "conversation:not-question",
      ],
      questionType: analysis.question.type,
    };
  }

  private add(
    scores: Map<InterviewType, number>,
    type: InterviewType,
    value: number,
  ): void {
    scores.set(type, (scores.get(type) ?? 0) + value);
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
