// ============================================================================
// FILE: core/prompts/templates/interview/general.ts
//
// PURPOSE:
// General interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const GENERAL_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.general",
  family: "interview",
  kind: "general",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "general";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "general-directness",
        role: "system",
        priority: "required",
        content:
          "Answer the interview question directly and naturally. Use the information available in the supplied evidence and conversation.",
      },
      {
        id: "general-grounding",
        role: "system",
        priority: "required",
        content:
          "Do not fabricate candidate-specific information or unsupported claims.",
      },
      {
        id: "general-question",
        role: "user",
        priority: "required",
        content: `Answer this interview question:\n${context.question}`,
      },
    ]);
  },
});
