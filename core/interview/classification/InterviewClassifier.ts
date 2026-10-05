// ============================================================================
// FILE: core/interview/classification/InterviewClassifier.ts
//
// PURPOSE:
// Determines what kind of interview/question/task is currently happening.
//
// INPUT:
//     ConversationAnalysis
//
// OUTPUT:
//     InterviewClassification
//
// ARCHITECTURAL RULE:
//
// Conversation answers:
//     "What was said?"
//     "Is it a question?"
//     "What conversational form does it have?"
//
// Interview answers:
//     "What kind of interview/task is this?"
//
// This classifier MUST NOT:
// - generate answers
// - retrieve candidate evidence
// - query Context directly
// - inspect audio
// - inspect vision
// - make AI-provider decisions
// ============================================================================

import type {
  ConversationAnalysis,
  ConversationQuestionType,
} from "../../../shared/types/conversation";

import type {
  InterviewClassification,
  InterviewClassificationAlternative,
} from "../../../shared/types/interviews";

import type { InterviewType } from "../../../shared/types/../constants/interviewTypes";

// ============================================================================
// SIGNAL DEFINITION
// ============================================================================

interface ClassificationScore {
  readonly type: InterviewType;

  readonly score: number;

  readonly signals: readonly string[];
}

// ============================================================================
// CLASSIFIER
// ============================================================================

export class InterviewClassifier {
  /**
   * Classify the current conversational event as an interview/task type.
   */
  public classify(analysis: ConversationAnalysis): InterviewClassification {
    if (!analysis) {
      return {
        type: "unknown",
        confidence: 0,
        alternatives: [],
        signals: ["missing-analysis"],
      };
    }

    const text = analysis.turn.text.trim();

    if (!text) {
      return {
        type: "unknown",
        confidence: 0,
        alternatives: [],
        signals: ["empty-text"],
        questionType: analysis.question.type,
      };
    }

    const scores = this.scoreText(text);

    const ranked = scores
      .filter((entry) => entry.type !== "unknown" && entry.type !== "mixed")
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];

    if (!best || best.score <= 0) {
      return {
        type: "unknown",
        confidence: 0.2,
        alternatives: [],
        signals: ["no-interview-type-signal"],
        questionType: analysis.question.type,
      };
    }

    const alternatives: InterviewClassificationAlternative[] = ranked
      .slice(1, 3)
      .filter((entry) => entry.score > 0)
      .map((entry) => ({
        type: entry.type,
        confidence: this.normalizeConfidence(entry.score),
      }));

    return {
      type: best.type,

      confidence: this.normalizeConfidence(best.score),

      alternatives,

      signals: [`question-type:${analysis.question.type}`, ...best.signals],

      questionType: analysis.question.type,
    };
  }

  // ==========================================================================
  // TEXT SCORING
  // ==========================================================================

  private scoreText(text: string): ClassificationScore[] {
    const normalized = text.toLowerCase();

    return [
      this.scoreBehavioral(normalized),
      this.scoreTechnical(normalized),
      this.scoreCoding(normalized),
      this.scoreSystemDesign(normalized),
      this.scoreProduct(normalized),
      this.scoreCase(normalized),
      this.scoreCommunication(normalized),
    ];
  }

  // ==========================================================================
  // BEHAVIORAL
  // ==========================================================================

  private scoreBehavioral(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [/\btell me about a time\b/i, "behavioral:time-based-question", 0.95],
      [/\bdescribe a time\b/i, "behavioral:describe-time", 0.95],
      [/\bgive me an example\b/i, "behavioral:example-request", 0.75],
      [/\bconflict\b/i, "behavioral:conflict", 0.65],
      [/\bdisagreement\b/i, "behavioral:disagreement", 0.65],
      [/\bfailure\b/i, "behavioral:failure", 0.65],
      [/\bmistake\b/i, "behavioral:mistake", 0.6],
      [/\bleadership\b/i, "behavioral:leadership", 0.65],
      [/\bchallenge\b/i, "behavioral:challenge", 0.55],
      [/\bteam\b/i, "behavioral:team", 0.3],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "behavioral",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // TECHNICAL
  // ==========================================================================

  private scoreTechnical(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [
        /\btypescript\b|\bjavascript\b|\bpython\b|\bjava\b|\bc\+\+\b/i,
        "technical:programming-language",
        0.45,
      ],
      [/\bapi\b|\brest\b|\bgraphql\b/i, "technical:api", 0.45],
      [/\bdatabase\b|\bsql\b|\bnosql\b/i, "technical:database", 0.45],
      [/\bhttp\b|\btcp\b|\budp\b|\bdns\b/i, "technical:networking", 0.5],
      [/\breact\b|\bnode\b|\bnext\.?js\b/i, "technical:framework", 0.4],
      [/\bdebug\b|\bdebugging\b/i, "technical:debugging", 0.55],
      [/\bhow does\b|\bwhy does\b/i, "technical:concept-question", 0.2],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "technical",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // CODING
  // ==========================================================================

  private scoreCoding(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [/\bimplement\b|\bwrite a function\b/i, "coding:implementation", 0.9],
      [/\bcode\b|\bcoding\b/i, "coding:code", 0.7],
      [/\balgorithm\b/i, "coding:algorithm", 0.85],
      [
        /\btime complexity\b|\bspace complexity\b|\bbig[- ]?o\b/i,
        "coding:complexity",
        0.9,
      ],
      [
        /\barray\b|\bstring\b|\blinked list\b|\btree\b|\bgraph\b/i,
        "coding:data-structure",
        0.55,
      ],
      [/\bfunction\b.*\breturn\b/i, "coding:function", 0.55],
      [/\bedge case\b/i, "coding:edge-case", 0.7],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "coding",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // SYSTEM DESIGN
  // ==========================================================================

  private scoreSystemDesign(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [/\bdesign a system\b/i, "system-design:design-a-system", 1],
      [/\bsystem design\b/i, "system-design:explicit", 0.95],
      [/\barchitecture\b/i, "system-design:architecture", 0.65],
      [/\bdistributed\b/i, "system-design:distributed", 0.7],
      [/\bscale\b|\bscaling\b|\bscalable\b/i, "system-design:scaling", 0.55],
      [
        /\bqueue\b|\bcache\b|\bload balancer\b/i,
        "system-design:infrastructure",
        0.55,
      ],
      [
        /\bhigh availability\b|\bfault tolerance\b/i,
        "system-design:reliability",
        0.7,
      ],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "system_design",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // PRODUCT
  // ==========================================================================

  private scoreProduct(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [/\bproduct\b/i, "product:explicit", 0.55],
      [/\buser experience\b|\bux\b/i, "product:user-experience", 0.6],
      [/\buser\b.*\bproblem\b|\buser needs\b/i, "product:user-problem", 0.7],
      [/\bmetric\b|\bmetrics\b/i, "product:metrics", 0.5],
      [/\broadmap\b/i, "product:roadmap", 0.7],
      [/\bprioritize\b|\bprioritization\b/i, "product:prioritization", 0.65],
      [/\bfeature\b/i, "product:feature", 0.35],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "product",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // CASE
  // ==========================================================================

  private scoreCase(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [/\bcase interview\b/i, "case:explicit", 1],
      [/\bmarket size\b|\bmarket sizing\b/i, "case:market-sizing", 0.9],
      [/\bmarket share\b/i, "case:market-share", 0.7],
      [/\bprofit\b|\bprofitability\b/i, "case:profitability", 0.65],
      [/\brevenue\b|\bcosts\b/i, "case:business-metrics", 0.45],
      [/\bestimate\b|\bapproximate\b/i, "case:estimation", 0.35],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "case",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // COMMUNICATION
  // ==========================================================================

  private scoreCommunication(text: string): ClassificationScore {
    const signals: string[] = [];
    let score = 0;

    const patterns: readonly [RegExp, string, number][] = [
      [
        /\bexplain .* to a non[- ]technical\b/i,
        "communication:non-technical-explanation",
        0.95,
      ],
      [/\bhow would you communicate\b/i, "communication:communication", 0.9],
      [/\bcommunicate\b/i, "communication:explicit", 0.65],
      [/\bexplain this simply\b/i, "communication:simplification", 0.75],
      [/\bexplain it to\b/i, "communication:audience-explanation", 0.6],
    ];

    for (const [pattern, signal, weight] of patterns) {
      if (pattern.test(text)) {
        score += weight;
        signals.push(signal);
      }
    }

    return {
      type: "communication",
      score: Math.min(1, score),
      signals,
    };
  }

  // ==========================================================================
  // CONFIDENCE
  // ==========================================================================

  private normalizeConfidence(score: number): number {
    if (score <= 0) {
      return 0;
    }

    /*
     * A strong explicit signal should approach 0.99 without pretending
     * deterministic certainty.
     */
    return Math.min(0.99, 0.45 + score * 0.55);
  }
}
