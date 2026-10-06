// ============================================================================
// FILE: core/prompts/templates/interview/motivation.ts
//
// PURPOSE:
// Motivation interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const MOTIVATION_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.motivation",
  family: "interview",
  kind: "motivation",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "motivation";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "motivation-authenticity",
        role: "system",
        priority: "required",
        content:
          "Ground motivation and career claims in verified candidate evidence whenever available.",
      },
      {
        id: "motivation-role-fit",
        role: "system",
        priority: "important",
        content:
          "Connect the candidate's demonstrated interests, experience, and goals to the question without manufacturing motivations.",
      },
      {
        id: "motivation-question",
        role: "user",
        priority: "required",
        content: `Answer this motivation interview question:\n${context.question}`,
      },
    ]);
  },
});
