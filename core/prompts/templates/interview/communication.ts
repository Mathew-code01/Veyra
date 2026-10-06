// ============================================================================
// FILE: core/prompts/templates/interview/communication.ts
//
// PURPOSE:
// Communication interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const COMMUNICATION_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.communication",
  family: "interview",
  kind: "communication",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "communication";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "communication-clarity",
        role: "system",
        priority: "required",
        content:
          "Prioritize clarity, structure, audience awareness, and direct communication.",
      },
      {
        id: "communication-natural",
        role: "system",
        priority: "required",
        content:
          "Use natural spoken language appropriate for an interview rather than overly formal written prose.",
      },
      {
        id: "communication-example",
        role: "system",
        priority: "important",
        content:
          "Use concrete examples when they are supported by verified candidate evidence.",
      },
      {
        id: "communication-question",
        role: "user",
        priority: "required",
        content: `Respond to this communication-focused interview task:\n${context.question}`,
      },
    ]);
  },
});
