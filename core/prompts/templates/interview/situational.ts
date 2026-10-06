// ============================================================================
// FILE: core/prompts/templates/interview/situational.ts
//
// PURPOSE:
// Situational interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const SITUATIONAL_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.situational",
  family: "interview",
  kind: "situational",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "situational";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "situational-approach",
        role: "system",
        priority: "required",
        content:
          "For hypothetical workplace scenarios, explain the candidate's proposed approach, priorities, communication, decision-making, and expected outcome.",
      },
      {
        id: "situational-reasoning",
        role: "system",
        priority: "important",
        content:
          "Focus on sound reasoning and practical action rather than pretending the hypothetical scenario is an actual past event.",
      },
      {
        id: "situational-question",
        role: "user",
        priority: "required",
        content: `Answer this situational interview question:\n${context.question}`,
      },
    ]);
  },
});
