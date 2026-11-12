// ============================================================================
// FILE: core/interview/understanding/QuestionUnderstandingEngine.ts
//
// PURPOSE:
// In-depth question understanding: identifies underlying competencies,
// expected response types, cognitive requirements, multi-part questions,
// ambiguity, and candidate evidence applicability.
// ============================================================================

import type {
  ExpectedResponseType,
  QuestionArchetype,
  QuestionRequirements,
  QuestionUnderstanding,
} from "../../../shared/types/interviews";

const ARCHETYPE_PATTERNS: Readonly<Array<{ archetype: QuestionArchetype; patterns: readonly RegExp[] }>> = [
  {
    archetype: "tell_me_about_yourself",
    patterns: [
      /\btell me about yourself\b/i,
      /\bwalk me through your (?:resume|cv|background)\b/i,
      /\bintroduce yourself\b/i,
      /\bgive me a brief overview of who you are\b/i,
    ],
  },
  {
    archetype: "why_hire_you",
    patterns: [
      /\bwhy should we hire you\b/i,
      /\bwhat makes you the best (?:candidate|fit)\b/i,
      /\bwhy are you the right person\b/i,
      /\bwhat do you bring to this role\b/i,
    ],
  },
  {
    archetype: "why_company",
    patterns: [
      /\bwhy (?:this company|our company|do you want to work here|veyra|us)\b/i,
      /\bwhat do you know about (?:us|our company|our mission)\b/i,
      /\bwhat attracted you to\b/i,
    ],
  },
  {
    archetype: "why_role",
    patterns: [
      /\bwhy (?:this role|this position|this job)\b/i,
      /\bwhat interests you about this role\b/i,
      /\bwhat excites you about this position\b/i,
    ],
  },
  {
    archetype: "strengths_weaknesses",
    patterns: [
      /\b(?:strengths? and weaknesses?|greatest strength|biggest weakness|areas? for improvement)\b/i,
      /\bwhat are your strengths\b/i,
      /\bwhat is your weakness\b/i,
    ],
  },
  {
    archetype: "conflict_resolution",
    patterns: [
      /\b(?:conflict|disagreement|difficult coworker|difficult colleague|disagreed with your manager|handled a dispute)\b/i,
      /\bhow do you handle conflict\b/i,
    ],
  },
  {
    archetype: "leadership_teamwork",
    patterns: [
      /\b(?:led a team|leadership style|motivat(?:e|ed) a team|team player|cross-functional collaboration)\b/i,
      /\bhow do you (?:manage|delegate|mentor)\b/i,
    ],
  },
  {
    archetype: "problem_solving",
    patterns: [
      /\b(?:solve|problem solving|overcame a challenge|difficult problem|complex issue|analytical challenge)\b/i,
      /\bhow did you troubleshoot\b/i,
    ],
  },
  {
    archetype: "technical_explanation",
    patterns: [
      /\b(?:how does .* work|explain the difference between|what is the purpose of|technical concept|deep dive into)\b/i,
      /\bcan you explain\b/i,
    ],
  },
  {
    archetype: "case_study",
    patterns: [
      /\b(?:case study|how would you grow|market size|profitability dropped|how would you increase revenue)\b/i,
      /\bestimate the number of\b/i,
    ],
  },
  {
    archetype: "scenario_question",
    patterns: [
      /\b(?:what would you do if|how would you handle a situation where|imagine that|suppose a client)\b/i,
      /\bhypothetical scenario\b/i,
    ],
  },
  {
    archetype: "numerical_analytical",
    patterns: [
      /\b(?:calculate|quantitative|metric|percentage|roi|formula|conversion rate|break-even|ebitda)\b/i,
      /\bhow would you measure\b/i,
    ],
  },
  {
    archetype: "ethical_dilemma",
    patterns: [
      /\b(?:ethical|dilemma|integrity|whistleblow|unethical|compliance violation|confidentiality)\b/i,
      /\bpressure to compromise\b/i,
    ],
  },
  {
    archetype: "role_knowledge",
    patterns: [
      /\b(?:regulations?|standard of care|gaap|ifrs|hipaa|gdpr|osha|best practices in|protocol for)\b/i,
      /\bwhat is the standard\b/i,
    ],
  },
  {
    archetype: "career_motivation",
    patterns: [
      /\b(?:where do you see yourself in (?:3|5|10) years|career goals?|future aspirations?|what motivates you)\b/i,
      /\blong-term career\b/i,
    ],
  },
  {
    archetype: "salary_expectations",
    patterns: [
      /\b(?:salary expectation|compensation requirement|target pay|desired salary|rate)\b/i,
    ],
  },
  {
    archetype: "cv_experience",
    patterns: [
      /\b(?:in your (?:last|previous|current) role|according to your resume|on your cv|tell me about your time at)\b/i,
    ],
  },
  {
    archetype: "project_achievement",
    patterns: [
      /\b(?:proudest project|biggest achievement|successful project|key accomplishment|impact you made)\b/i,
    ],
  },
];

export class QuestionUnderstandingEngine {
  public understand(
    questionText: string,
    candidateEvidenceTexts: readonly string[] = [],
  ): QuestionUnderstanding {
    const raw = questionText.trim();
    const archetype = this.detectArchetype(raw);
    const expectedResponseType = this.detectExpectedResponseType(raw, archetype);
    const requirements = this.detectRequirements(raw, expectedResponseType);
    const assessedCompetencies = this.detectCompetencies(raw, archetype);
    const multiPart = this.detectMultiPart(raw);
    const ambiguity = this.detectAmbiguity(raw);

    const relevantProfileItems = candidateEvidenceTexts.filter((text) =>
      this.isEvidenceRelevant(text, raw, assessedCompetencies),
    );

    const coreIntent = this.deriveCoreIntent(raw, archetype, assessedCompetencies);

    return {
      rawQuestion: raw,
      coreIntent,
      archetype,
      assessedCompetencies,
      expectedResponseType,
      requirements,
      isAmbiguous: ambiguity.isAmbiguous,
      ambiguityReason: ambiguity.reason,
      isMultiPart: multiPart.isMultiPart,
      parts: multiPart.parts,
      clarificationRecommended: ambiguity.isAmbiguous || (multiPart.isMultiPart && multiPart.parts.length > 2),
      suggestedClarification: ambiguity.suggestedClarification,
      profileEvidenceAvailable: relevantProfileItems.length > 0,
      relevantProfileItems: relevantProfileItems.slice(0, 5),
    };
  }

  private detectArchetype(question: string): QuestionArchetype {
    for (const item of ARCHETYPE_PATTERNS) {
      for (const pattern of item.patterns) {
        if (pattern.test(question)) {
          return item.archetype;
        }
      }
    }
    return "general";
  }

  private detectExpectedResponseType(
    question: string,
    archetype: QuestionArchetype,
  ): ExpectedResponseType {
    switch (archetype) {
      case "tell_me_about_yourself":
      case "cv_experience":
      case "project_achievement":
      case "conflict_resolution":
        return "experience_based";
      case "technical_explanation":
      case "role_knowledge":
        return "knowledge_based";
      case "case_study":
        return "case_recommendation";
      case "numerical_analytical":
        return "calculation_analytical";
      case "scenario_question":
      case "ethical_dilemma":
        return "scenario_action";
      case "why_company":
      case "why_role":
      case "why_hire_you":
      case "career_motivation":
        return "opinion_reasoning";
      default:
        if (/\b(?:tell me about a time|describe a situation|give an example)\b/i.test(question)) {
          return "experience_based";
        }
        if (/\b(?:what would you do|how would you handle)\b/i.test(question)) {
          return "scenario_action";
        }
        return "knowledge_based";
    }
  }

  private detectRequirements(
    question: string,
    responseType: ExpectedResponseType,
  ): QuestionRequirements {
    const requiresCalculations = /\b(?:calculate|metric|ratio|margin|roi|percentage|formula|number|estimate)\b/i.test(question);
    const requiresConcreteExamples = responseType === "experience_based" || /\b(?:example|instance|story|time)\b/i.test(question);
    const requiresPersonalExperience = responseType === "experience_based" || /\b(?:your experience|you personally|your role)\b/i.test(question);
    const requiresFactualKnowledge = responseType === "knowledge_based" || /\b(?:explain|define|how does|what is)\b/i.test(question);
    const requiresReasoning = true; // All professional interview questions evaluate cognitive reasoning

    return {
      requiresFactualKnowledge,
      requiresPersonalExperience,
      requiresReasoning,
      requiresCalculations,
      requiresConcreteExamples,
    };
  }

  private detectCompetencies(question: string, archetype: QuestionArchetype): readonly string[] {
    const competencies = new Set<string>();

    switch (archetype) {
      case "conflict_resolution":
        competencies.add("Conflict Management");
        competencies.add("Interpersonal Communication");
        competencies.add("Emotional Intelligence");
        break;
      case "leadership_teamwork":
        competencies.add("Leadership");
        competencies.add("Team Collaboration");
        competencies.add("Delegation & Empowerment");
        break;
      case "technical_explanation":
        competencies.add("Domain Expertise");
        competencies.add("Technical Communication");
        break;
      case "problem_solving":
        competencies.add("Structured Problem Solving");
        competencies.add("Root-Cause Analysis");
        competencies.add("Resilience");
        break;
      case "case_study":
        competencies.add("Strategic Thinking");
        competencies.add("Business Acumen");
        competencies.add("Structured Framing");
        break;
      case "numerical_analytical":
        competencies.add("Quantitative Reasoning");
        competencies.add("Data-Driven Decision Making");
        break;
      case "ethical_dilemma":
        competencies.add("Professional Integrity");
        competencies.add("Ethical Judgment");
        competencies.add("Regulatory Compliance");
        break;
      case "why_company":
      case "why_role":
        competencies.add("Company Alignment");
        competencies.add("Career Intentionality");
        break;
      case "tell_me_about_yourself":
        competencies.add("Executive Presence");
        competencies.add("Synthesizing Experience");
        break;
      default:
        competencies.add("Professional Communication");
        competencies.add("Domain Competence");
        break;
    }

    // Additional signal checks
    if (/\b(?:team|collaborat|coworker|stakeholder)\b/i.test(question)) competencies.add("Stakeholder Management");
    if (/\b(?:deadline|pressure|urgent|fast-paced)\b/i.test(question)) competencies.add("Prioritization & Execution");
    if (/\b(?:learn|adapt|pivot|flexible)\b/i.test(question)) competencies.add("Continuous Learning & Adaptability");

    return [...competencies];
  }

  private detectMultiPart(question: string): { isMultiPart: boolean; parts: readonly string[] } {
    // Check multiple question marks
    const qMarkMatches = question.match(/[^?]+(?:\?|$)/g)?.map((s) => s.trim()).filter((s) => s.length > 5) ?? [];
    if (qMarkMatches.length > 1) {
      return { isMultiPart: true, parts: qMarkMatches };
    }

    // Check compound sentences like "Tell me about X and also how you handled Y"
    const compoundMatch = question.split(/\b(?:and also|and how did you|as well as how)\b/i);
    if (compoundMatch.length > 1) {
      return { isMultiPart: true, parts: compoundMatch.map((s) => s.trim()) };
    }

    return { isMultiPart: false, parts: [question] };
  }

  private detectAmbiguity(question: string): {
    isAmbiguous: boolean;
    reason?: string;
    suggestedClarification?: string;
  } {
    const q = question.trim();
    if (q.length < 15 && !q.includes("yourself")) {
      return {
        isAmbiguous: true,
        reason: "Question is exceptionally brief and lacks context or explicit scope.",
        suggestedClarification: `Could you clarify which specific aspect or scenario you'd like me to focus on?`,
      };
    }

    if (/\b(?:tell me about it|explain that|how about the project|what about that)\b/i.test(q)) {
      return {
        isAmbiguous: true,
        reason: "Contains ambiguous pronouns without explicit referent.",
        suggestedClarification: "Could you specify which project or experience you are referring to?",
      };
    }

    return { isAmbiguous: false };
  }

  private isEvidenceRelevant(evidenceText: string, question: string, competencies: readonly string[]): boolean {
    const lowerEvidence = evidenceText.toLowerCase();
    const lowerQ = question.toLowerCase();

    // Check token overlap
    const qWords = lowerQ.split(/\W+/).filter((w) => w.length > 3);
    const matchCount = qWords.filter((w) => lowerEvidence.includes(w)).length;
    if (matchCount >= 2) return true;

    // Check competency overlap
    for (const comp of competencies) {
      const compWords = comp.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      if (compWords.some((w) => lowerEvidence.includes(w))) return true;
    }

    return false;
  }

  private deriveCoreIntent(
    question: string,
    archetype: QuestionArchetype,
    competencies: readonly string[],
  ): string {
    if (archetype === "tell_me_about_yourself") {
      return "Assess overall career trajectory, communication clarity, and role relevance.";
    }
    if (archetype === "conflict_resolution") {
      return "Evaluate interpersonal maturity, de-escalation capability, and empathy under friction.";
    }
    if (archetype === "technical_explanation") {
      return "Test technical depth and ability to communicate complex concepts clearly.";
    }
    return `Evaluate candidate's capability in ${competencies.slice(0, 2).join(" and ")} through structured response.`;
  }
}
