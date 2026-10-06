// ============================================================================
// FILE: core/prompts/templates/interview/case.ts
//
// PURPOSE:
// Case interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const CASE_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.case",
  family: "interview",
  kind: "case",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "case";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "case-structure",
        role: "system",
        priority: "required",
        content:
          "Approach case problems with a clear issue structure. Identify the objective, break the problem into logical components, test assumptions, and synthesize the conclusion.",
      },
      {
        id: "case-evidence",
        role: "system",
        priority: "required",
        content:
          "Separate supplied case facts from assumptions. Do not invent data that the case does not provide.",
      },
      {
        id: "case-conclusion",
        role: "system",
        priority: "important",
        content:
          "End with a concise recommendation or conclusion when the task calls for one, including key risks or next steps.",
      },
      {
        id: "case-question",
        role: "user",
        priority: "required",
        content: `Work through this case interview task:\n${context.question}`,
      },
    ]);
  },
});
