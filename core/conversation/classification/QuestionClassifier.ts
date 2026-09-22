// core/conversation/QuestionClassifier.ts

import type {
  QuestionAnalysis,
  QuestionType,
} from "../../shared/types/conversation";

interface ClassificationResult {
  type: QuestionType;
  confidence: number;
  signals: string[];
}

const RULES: Array<{
  type: QuestionType;
  patterns: RegExp[];
}> = [
  {
    type: "behavioral",
    patterns: [
      /\btell me about a time\b/i,
      /\bgive me an example\b/i,
      /\bdescribe a time\b/i,
      /\btell me about an occasion\b/i,
      /\bwhen have you\b/i,
      /\bhow did you handle\b/i,
      /\bconflict\b/i,
      /\bdisagreement\b/i,
      /\bmistake\b/i,
      /\bfailure\b/i,
      /\bchallenge\b/i,
      /\bleadership\b/i,
    ],
  },

  {
    type: "technical",
    patterns: [
      /\bhow does\b/i,
      /\bhow do\b/i,
      /\bwhat is\b/i,
      /\bwhat are\b/i,
      /\bexplain\b/i,
      /\btypescript\b/i,
      /\bjavascript\b/i,
      /\breact\b/i,
      /\bnode\b/i,
      /\bapi\b/i,
      /\bdatabase\b/i,
      /\bcaching\b/i,
      /\btesting\b/i,
      /\bhttp\b/i,
      /\brest\b/i,
      /\bgraphql\b/i,
    ],
  },

  {
    type: "coding",
    patterns: [
      /\bwrite code\b/i,
      /\bwrite a function\b/i,
      /\bimplement\b/i,
      /\balgorithm\b/i,
      /\btime complexity\b/i,
      /\bspace complexity\b/i,
      /\bdata structure\b/i,
      /\bleetcode\b/i,
      /\barray\b/i,
      /\blinked list\b/i,
      /\btree\b/i,
      /\bgraph\b/i,
      /\bdynamic programming\b/i,
    ],
  },

  {
    type: "system_design",
    patterns: [
      /\bdesign a system\b/i,
      /\bsystem design\b/i,
      /\bdesign.*platform\b/i,
      /\bdesign.*application\b/i,
      /\bscale\b/i,
      /\bscalable\b/i,
      /\bmillions of users\b/i,
      /\bhigh availability\b/i,
      /\barchitecture\b/i,
      /\bdistributed\b/i,
      /\bload balancer\b/i,
      /\bcache\b/i,
      /\bqueue\b/i,
    ],
  },

  {
    type: "product",
    patterns: [
      /\bproduct\b/i,
      /\bproduct manager\b/i,
      /\buser needs\b/i,
      /\bprioritize\b/i,
      /\broadmap\b/i,
      /\bmetrics\b/i,
      /\bkpi\b/i,
      /\buser growth\b/i,
      /\bfeature\b/i,
    ],
  },

  {
    type: "case",
    patterns: [
      /\bmarket size\b/i,
      /\bmarket entry\b/i,
      /\bprofit\b/i,
      /\brevenue\b/i,
      /\bcost\b/i,
      /\bcase study\b/i,
      /\bconsulting\b/i,
      /\bmarket\b/i,
    ],
  },

  {
    type: "motivation",
    patterns: [
      /\bwhy do you want\b/i,
      /\bwhy this company\b/i,
      /\bwhy are you interested\b/i,
      /\bwhy should we hire you\b/i,
      /\bwhy this role\b/i,
    ],
  },

  {
    type: "experience",
    patterns: [
      /\btell me about yourself\b/i,
      /\byour experience\b/i,
      /\byour background\b/i,
      /\byour career\b/i,
      /\bwalk me through your resume\b/i,
    ],
  },

  {
    type: "communication",
    patterns: [
      /\bcommunicate\b/i,
      /\bcommunication\b/i,
      /\bexplain.*non technical\b/i,
      /\bexplain.*simple terms\b/i,
      /\bpresent\b/i,
    ],
  },
];

export class QuestionClassifier {
  classify(question: QuestionAnalysis): QuestionAnalysis {
    if (!question.isQuestion) {
      return question;
    }

    const result = this.classifyText(question.normalizedText);

    return {
      ...question,
      type: result.type,
      confidence: Math.max(question.confidence, result.confidence),
      questionSignals: [
        ...new Set([...question.questionSignals, ...result.signals]),
      ],
    };
  }

  private classifyText(text: string): ClassificationResult {
    const results: ClassificationResult[] = [];

    for (const rule of RULES) {
      const matched = rule.patterns.filter((pattern) => pattern.test(text));

      if (matched.length === 0) continue;

      const confidence = Math.min(0.98, 0.55 + matched.length * 0.08);

      results.push({
        type: rule.type,
        confidence,
        signals: matched.map((pattern) => pattern.source),
      });
    }

    if (results.length === 0) {
      return {
        type: "general",
        confidence: 0.45,
        signals: [],
      };
    }

    results.sort((a, b) => b.confidence - a.confidence);

    return results[0];
  }
}