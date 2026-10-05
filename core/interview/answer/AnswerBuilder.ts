
// ============================================================================
// FILE: core/interview/answer/AnswerBuilder.ts
//
// PURPOSE:
// Builds deterministic interview-answer guidance.
//
// IMPORTANT:
//
// This class does NOT:
// - invent candidate experience
// - invent technologies
// - invent achievements
// - generate unsupported factual claims
// - call an AI provider
//
// It produces structured guidance that can later be consumed by core/ai.
// ============================================================================

import type {
  InterviewAnswerGuidance,
  InterviewClassification,
} from "../../../shared/types/interviews";

import type { ConversationAnalysis } from "../../../shared/types/conversation";

import { InterviewError } from "../errors/InterviewError";

export interface AnswerBuilderOptions {
  readonly candidateName?: string;

  readonly candidateContextAvailable?: boolean;
}

export class AnswerBuilder {
  private readonly options: AnswerBuilderOptions;

  public constructor(options: AnswerBuilderOptions = {}) {
    this.options = options;
  }

  public build(
    analysis: ConversationAnalysis,
    classification: InterviewClassification,
  ): InterviewAnswerGuidance {
    if (!analysis) {
      throw InterviewError.answerFailure(
        "Conversation analysis is required to build answer guidance.",
      );
    }

    const question = analysis.turn.text.trim();

    if (!question) {
      throw InterviewError.answerFailure(
        "Cannot build answer guidance from empty conversation text.",
      );
    }

    const base = this.buildForType(
      classification.type,
      question,
    );

    return {
      ...base,
      confidence: Math.min(
        classification.confidence,
        Math.max(
          analysis.question.confidence,
          analysis.intent.confidence,
        ),
      ),
      sourceQuestion: question,
    };
  }

  private buildForType(
    type: InterviewClassification["type"],
    question: string,
  ): InterviewAnswerGuidance {
    switch (type) {
      case "behavioral":
        return this.behavioral(question);

      case "technical":
        return this.technical(question);

      case "coding":
        return this.coding(question);

      case "system_design":
        return this.systemDesign(question);

      case "case":
        return this.caseInterview(question);

      case "product":
        return this.product(question);

      case "communication":
        return this.communication(question);

      case "experience":
        return this.experience(question);

      case "motivation":
        return this.motivation(question);

      case "situational":
        return this.situational(question);

      case "general":
      default:
        return this.general(question);
    }
  }

  private behavioral(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "behavioral",
      "Use a concrete experience and structure it clearly.",
      [
        "Situation: establish the relevant context.",
        "Task: explain what responsibility or goal existed.",
        "Action: focus on what you personally did.",
        "Result: give the measurable or observable outcome.",
        "Reflection: briefly explain what you learned when useful.",
      ],
      [
        "Avoid vague team-level statements when the interviewer asks what you personally did.",
        "Do not invent metrics or outcomes.",
        "Use candidate evidence when available.",
      ],
      question,
    );
  }

  private technical(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "technical",
      "Answer the concept directly, then explain the reasoning and trade-offs.",
      [
        "Start with a concise definition or direct answer.",
        "Explain how the concept works.",
        "Give a practical example.",
        "Mention important trade-offs or limitations.",
        "Connect the explanation to the technology or context in the question.",
      ],
      [
        "Do not claim experience with a technology unless candidate evidence supports it.",
        "Distinguish general technical knowledge from personal experience.",
      ],
      question,
    );
  }

  private coding(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "coding",
      "Clarify the problem, reason about the solution, then implement and validate it.",
      [
        "Restate the problem and clarify assumptions.",
        "Identify the simplest correct approach.",
        "Explain the algorithm before implementation.",
        "Discuss time and space complexity.",
        "Consider edge cases.",
        "Validate the implementation with representative examples.",
      ],
      [
        "Do not jump directly into code without understanding the problem.",
        "Prefer correctness before optimization.",
      ],
      question,
    );
  }

  private systemDesign(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "system_design",
      "Start from requirements and evolve the architecture through explicit trade-offs.",
      [
        "Clarify functional requirements.",
        "Clarify scale and non-functional requirements.",
        "Estimate important traffic or storage characteristics when appropriate.",
        "Propose the high-level architecture.",
        "Explain data storage and API boundaries.",
        "Address scalability, reliability, security, and observability.",
        "Discuss major trade-offs and bottlenecks.",
      ],
      [
        "Do not introduce infrastructure without explaining why it is needed.",
        "Avoid overengineering before establishing requirements.",
      ],
      question,
    );
  }

  private caseInterview(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "case",
      "Structure the problem before solving it.",
      [
        "Clarify the objective.",
        "Break the problem into logical drivers.",
        "State assumptions explicitly.",
        "Analyze the highest-impact factors first.",
        "Use quantitative reasoning where useful.",
        "Synthesize the findings into a recommendation.",
      ],
      [
        "Separate assumptions from known facts.",
        "Show the reasoning rather than only giving the conclusion.",
      ],
      question,
    );
  }

  private product(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "product",
      "Frame the answer around users, outcomes, priorities, and measurable impact.",
      [
        "Identify the target user.",
        "Define the user problem.",
        "Explain why the problem matters.",
        "Prioritize the proposed solution.",
        "Define success metrics.",
        "Discuss trade-offs and alternatives.",
      ],
      [
        "Do not prioritize features without explaining the user or business value.",
        "Avoid confusing activity metrics with outcome metrics.",
      ],
      question,
    );
  }

  private communication(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "communication",
      "Keep the explanation clear, audience-aware, and structured.",
      [
        "Lead with the main point.",
        "Use simple language before technical detail.",
        "Give an example where useful.",
        "Check assumptions about the audience.",
        "End with the practical implication.",
      ],
      [
        "Avoid unnecessary jargon.",
        "Do not bury the answer beneath background information.",
      ],
      question,
    );
  }

  private experience(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "experience",
      "Use verified candidate evidence and connect it directly to the question.",
      [
        "Identify the most relevant candidate experience.",
        "Describe the candidate's actual responsibility.",
        "Explain the work or decision involved.",
        "Give evidence of the result.",
        "Connect the experience back to the role or question.",
      ],
      [
        "Use candidate context rather than inventing employment history.",
        "Never fabricate projects, employers, dates, metrics, or responsibilities.",
      ],
      question,
    );
  }

  private motivation(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "motivation",
      "Connect genuine motivation to the role, company, problem, or growth opportunity.",
      [
        "Identify the genuine motivation.",
        "Connect it to the role.",
        "Explain why the work is interesting.",
        "Use candidate background where relevant.",
        "Avoid generic statements that could apply to every company.",
      ],
      [
        "Do not invent personal motivations.",
        "Use candidate context for factual background.",
      ],
      question,
    );
  }

  private situational(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "situational",
      "Explain how you would approach the hypothetical situation step by step.",
      [
        "Clarify the situation and constraints.",
        "Identify the immediate priority.",
        "Explain the decision-making process.",
        "Describe communication and stakeholder considerations.",
        "Explain the expected outcome.",
        "Mention what would change the approach.",
      ],
      [
        "Keep hypothetical actions separate from past experience.",
        "Do not present hypothetical outcomes as facts.",
      ],
      question,
    );
  }

  private general(
    question: string,
  ): InterviewAnswerGuidance {
    return this.guidance(
      "general",
      "Answer directly and structure the response around the exact question.",
      [
        "Identify what the interviewer is asking.",
        "Give the direct answer first.",
        "Provide supporting reasoning or evidence.",
        "Conclude with the key point.",
      ],
      [
        "Do not invent information.",
        "Ask for clarification if the question is genuinely ambiguous.",
      ],
      question,
    );
  }

  private guidance(
    type: InterviewClassification["type"],
    headline: string,
    talkingPoints: readonly string[],
    cautions: readonly string[],
    question: string,
  ): InterviewAnswerGuidance {
    const sections = [
      {
        id: `${type}:approach`,
        title: "Response approach",
        content: headline,
        priority: "primary" as const,
      },
      {
        id: `${type}:evidence`,
        title: "Evidence",
        content: this.options.candidateContextAvailable
          ? "Use verified candidate context where the question requires personal experience."
          : "Candidate context is not currently available; do not invent personal experience.",
        priority: "primary" as const,
      },
    ];

    return {
      type,
      headline,
      sections,
      talkingPoints,
      cautions,
      confidence: 0.5,
      sourceQuestion: question,
    };
  }
}
