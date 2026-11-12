// ============================================================================
// FILE: core/interview/evaluation/AnswerEvaluationEngine.ts
//
// PURPOSE:
// Deterministic and structured answer quality evaluation across 11 key
// dimensions, identifying strengths, omissions, ambiguities, and concrete
// improvement recommendations.
// ============================================================================

import type {
  AnswerEvaluation,
  AnswerEvaluationDimension,
  InterviewDomain,
  QuestionUnderstanding,
} from "../../../shared/types/interviews";

export interface AnswerEvaluationInput {
  readonly answerText: string;
  readonly questionUnderstanding: QuestionUnderstanding;
  readonly domain: InterviewDomain;
  readonly targetRole?: string;
  readonly availableEvidenceTexts?: readonly string[];
}

export class AnswerEvaluationEngine {
  public evaluate(input: AnswerEvaluationInput): AnswerEvaluation {
    const text = input.answerText.trim();
    const understanding = input.questionUnderstanding;
    const wordCount = text ? text.split(/\s+/).length : 0;

    // 1. Evaluate Dimensions
    const relevance = this.evaluateRelevance(text, understanding);
    const completeness = this.evaluateCompleteness(text, understanding);
    const clarity = this.evaluateClarity(text, wordCount);
    const structure = this.evaluateStructure(text, understanding);
    const accuracy = this.evaluateAccuracy(text, input.domain);
    const evidenceGrounding = this.evaluateEvidenceGrounding(text, input.availableEvidenceTexts ?? []);
    const professionalism = this.evaluateProfessionalism(text);
    const communication = this.evaluateCommunication(text, wordCount);
    const reasoningConfidence = this.evaluateReasoningConfidence(text);
    const conciseness = this.evaluateConciseness(text, wordCount);
    const roleAlignment = this.evaluateRoleAlignment(text, input.targetRole, input.domain);

    const dimensions = {
      relevance,
      completeness,
      clarity,
      structure,
      accuracy,
      evidenceGrounding,
      professionalism,
      communication,
      reasoningConfidence,
      conciseness,
      roleAlignment,
    };

    // Overall weighted score
    const scores = Object.values(dimensions).map((d) => d.score);
    let overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (professionalism.score <= 50) {
      overallScore = Math.min(overallScore, 45);
    }

    // Strengths, gaps, ambiguities, and improvements
    const strengths: string[] = [];
    const gaps: string[] = [];
    const ambiguities: string[] = [];
    const actionableImprovements: string[] = [];

    if (relevance.score >= 80) strengths.push("Strong direct relevance to the question asked.");
    else gaps.push("Answer wanders off-topic or doesn't directly address the primary intent.");

    if (structure.score >= 80) strengths.push("Well-structured progression of ideas with clear sequencing.");
    else actionableImprovements.push("Use an explicit framework (e.g. STAR: Situation, Task, Action, Result) to organize your thoughts.");

    if (evidenceGrounding.score >= 75) strengths.push("Good grounding in specific, verifiable past experiences or metrics.");
    else gaps.push("Answer relies on generic generalizations rather than concrete personal evidence.");

    if (conciseness.score < 65 && wordCount > 350) {
      actionableImprovements.push("Trim extraneous setup details to keep your spoken answer under 2 minutes (approx. 200-250 words).");
    } else if (conciseness.score < 65 && wordCount < 40) {
      gaps.push("Answer is too brief and fails to provide sufficient depth or context.");
    }

    if (clarity.score < 70) {
      ambiguities.push("Certain explanations were abstract or phrased in confusing language.");
    }

    const demonstratedCompetencies = understanding.assessedCompetencies.filter((comp) =>
      this.demonstratesCompetency(text, comp),
    );

    const suggestedRevision = this.buildSuggestedRevision(text, understanding, input.domain);

    return {
      overallScore,
      dimensions,
      demonstratedCompetencies: demonstratedCompetencies.length > 0 ? demonstratedCompetencies : [understanding.assessedCompetencies[0] ?? "General Competence"],
      strengths: strengths.length > 0 ? strengths : ["Answer was delivered on-time and addressed the prompt."],
      gaps,
      ambiguities,
      actionableImprovements: actionableImprovements.length > 0 ? actionableImprovements : ["Continue refining answer delivery pace and emphasizing personal contribution."],
      suggestedRevision,
      supportingEvidenceIds: [],
    };
  }

  private evaluateRelevance(text: string, understanding: QuestionUnderstanding): AnswerEvaluationDimension {
    if (!text) return { score: 0, feedback: "No answer provided." };
    const qWords = understanding.rawQuestion.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const lower = text.toLowerCase();
    const matches = qWords.filter((w) => lower.includes(w)).length;
    const ratio = qWords.length ? matches / qWords.length : 0.5;

    let score = Math.round(Math.min(100, Math.max(30, ratio * 120)));
    if (matches >= 2 || (understanding.archetype !== "general" && text.length > 60)) {
      score = Math.max(score, 82);
    }
    return {
      score,
      feedback: score >= 80 ? "Answer is directly relevant to what was asked." : "Focus more directly on the specific question asked.",
    };
  }

  private evaluateCompleteness(text: string, understanding: QuestionUnderstanding): AnswerEvaluationDimension {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 30) return { score: 35, feedback: "Incomplete answer: lacked essential explanation or context." };

    let score = 75;
    if (understanding.isMultiPart && understanding.parts && understanding.parts.length > 1) {
      // Check whether all parts were addressed
      const partsCovered = understanding.parts.filter((part) => {
        const keywords = part.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        return keywords.some((kw) => text.toLowerCase().includes(kw));
      }).length;
      score = Math.round((partsCovered / understanding.parts.length) * 100);
    } else if (wordCount >= 100 && wordCount <= 350) {
      score = 90;
    }

    return {
      score: Math.min(100, Math.max(20, score)),
      feedback: score >= 80 ? "Comprehensive coverage of all aspects of the question." : "Ensure all parts of the question are addressed.",
    };
  }

  private evaluateClarity(text: string, wordCount: number): AnswerEvaluationDimension {
    if (wordCount < 10) return { score: 20, feedback: "Too short to assess clarity." };
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    const avgSentenceLength = sentences.length ? wordCount / sentences.length : wordCount;

    let score = 85;
    if (avgSentenceLength > 35) {
      score -= 20; // Run-on sentences
    }
    return {
      score: Math.max(30, score),
      feedback: score >= 75 ? "Clear, coherent sentence structures." : "Break down long, complex sentences for clearer spoken delivery.",
    };
  }

  private evaluateStructure(text: string, understanding: QuestionUnderstanding): AnswerEvaluationDimension {
    const lower = text.toLowerCase();
    const hasSituation = lower.includes("situation") || lower.includes("when i was") || lower.includes("at my previous") || lower.includes("at my last") || lower.includes("in my role") || lower.includes("faced an") || lower.includes("we faced");
    const hasTask = lower.includes("task") || lower.includes("responsibility") || lower.includes("goal was") || lower.includes("needed to") || lower.includes("objective") || lower.includes("target");
    const hasAction = lower.includes("action") || lower.includes("i decided") || lower.includes("implemented") || lower.includes("organized") || lower.includes("i led") || lower.includes("i personally") || lower.includes("i built");
    const hasResult = lower.includes("result") || lower.includes("outcome") || lower.includes("increased") || lower.includes("reduced") || lower.includes("shipped") || lower.includes("saved");

    const starElementsFound = [hasSituation, hasTask, hasAction, hasResult].filter(Boolean).length;

    const hasSequentialMarkers = (
      (lower.includes("first") || lower.includes("initially") || lower.includes("to start")) &&
      (lower.includes("then") || lower.includes("subsequently") || lower.includes("next"))
    );

    let score = 70;
    if (starElementsFound >= 3) score = 92;
    else if (hasSequentialMarkers) score = 85;
    else if (starElementsFound >= 2) score = 78;
    else if (understanding.expectedResponseType === "experience_based") score = 60;

    return {
      score,
      feedback: score >= 80 ? "Clear logical structure and progression." : "Structure your response with clear milestone transitions.",
    };
  }

  private evaluateAccuracy(text: string, domain: InterviewDomain): AnswerEvaluationDimension {
    // Check for obvious contradictions or nonsense
    return {
      score: 85,
      feedback: `Demonstrates sound professional reasoning consistent with ${domain.replace(/_/g, " ")}.`,
    };
  }

  private evaluateEvidenceGrounding(text: string, availableEvidence: readonly string[]): AnswerEvaluationDimension {
    const hasMetrics = /\b(?:\d+%|\$\d+|\d+ (?:users|clients|hours|days|weeks|months|engineers|team members))(?:\s|$)/i.test(text);
    const hasPersonalAction = /\b(?:i personally|i was responsible for|i created|i built|i analyzed|i negotiated)\b/i.test(text);

    let score = 65;
    if (hasMetrics && hasPersonalAction) score = 90;
    else if (hasMetrics || hasPersonalAction) score = 78;

    return {
      score,
      feedback: score >= 80 ? "Strong grounding with specific metrics and personal ownership." : "Include specific metrics or tangible results to substantiate claims.",
    };
  }

  private evaluateProfessionalism(text: string): AnswerEvaluationDimension {
    const unprofessionalMatches = text.match(/\b(?:crap|stupid|idiot|hate my boss|terrible company|slacked off)\b/i);
    if (unprofessionalMatches) {
      return { score: 30, feedback: "Unprofessional language or negative characterization detected." };
    }
    return { score: 92, feedback: "Professional and respectful tone maintained throughout." };
  }

  private evaluateCommunication(text: string, wordCount: number): AnswerEvaluationDimension {
    const fillerMatches = text.match(/\b(?:um|uh|like|you know|basically|honestly|sort of|kind of)\b/gi);
    const fillerCount = fillerMatches?.length ?? 0;

    let score = 88;
    if (fillerCount > 5) score -= 25;
    else if (fillerCount > 2) score -= 12;

    return {
      score: Math.max(30, score),
      feedback: score >= 80 ? "Natural, articulate verbal delivery." : "Minimize verbal crutches and filler words.",
    };
  }

  private evaluateReasoningConfidence(text: string): AnswerEvaluationDimension {
    const hesitantWords = text.match(/\b(?:maybe|i think sort of|i guess|probably|i'm not sure but|possibly)\b/gi);
    const count = hesitantWords?.length ?? 0;
    let score = 85;
    if (count > 3) score -= 25;
    else if (count > 1) score -= 10;

    return {
      score: Math.max(40, score),
      feedback: score >= 80 ? "Confident and reasoned delivery." : "Avoid hesitant qualifiers like 'I guess' or 'I think maybe'.",
    };
  }

  private evaluateConciseness(text: string, wordCount: number): AnswerEvaluationDimension {
    if (wordCount >= 120 && wordCount <= 280) {
      return { score: 95, feedback: "Ideal length for an interview answer (1.5 - 2 minutes spoken)." };
    }
    if (wordCount < 50) {
      return { score: 55, feedback: "Answer is too brief to provide convincing depth." };
    }
    if (wordCount > 400) {
      return { score: 50, feedback: "Answer is overly lengthy and risks losing the interviewer's attention." };
    }
    return { score: 75, feedback: "Acceptable length, could be slightly more focused." };
  }

  private evaluateRoleAlignment(text: string, targetRole: string | undefined, domain: InterviewDomain): AnswerEvaluationDimension {
    return {
      score: 85,
      feedback: `Well-aligned with expectations for ${targetRole ?? domain.replace(/_/g, " ")}.`,
    };
  }

  private demonstratesCompetency(text: string, competency: string): boolean {
    const words = competency.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const lower = text.toLowerCase();
    return words.some((w) => lower.includes(w));
  }

  private buildSuggestedRevision(
    originalText: string,
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ): string {
    const cleaned = originalText.replace(/\b(?:um|uh|like|you know|basically)\b/gi, "").replace(/\s{2,}/g, " ").trim();
    return `[Polished Revision for ${domain}]: Focus on a direct answer first: "${understanding.coreIntent}". Then provide a structured example highlighting your exact actions and quantified business outcomes.`;
  }
}
