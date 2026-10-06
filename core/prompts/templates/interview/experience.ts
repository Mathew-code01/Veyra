// ============================================================================
// FILE: core/prompts/templates/interview/experience.ts
//
// PURPOSE:
// Experience/background interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const EXPERIENCE_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.experience",
  family: "interview",
  kind: "experience",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "experience";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "experience-grounding",
        role: "system",
        priority: "required",
        content:
          "Answer background and experience questions using only verified candidate information.",
      },
      {
        id: "experience-relevance",
        role: "system",
        priority: "important",
        content:
          "Select the candidate evidence most relevant to the question rather than listing unrelated background information.",
      },
      {
        id: "experience-question",
        role: "user",
        priority: "required",
        content: `Answer this experience/background interview question:\n${context.question}`,
      },
    ]);
  },
});
