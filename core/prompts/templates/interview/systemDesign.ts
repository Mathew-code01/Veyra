// ============================================================================
// FILE: core/prompts/templates/interview/systemDesign.ts
//
// PURPOSE:
// System-design interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const SYSTEM_DESIGN_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.system_design",
  family: "interview",
  kind: "system_design",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "system_design";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "system-design-requirements",
        role: "system",
        priority: "required",
        content:
          "For system-design questions, establish functional requirements, important non-functional requirements, scale assumptions, and constraints before selecting architecture.",
      },
      {
        id: "system-design-architecture",
        role: "system",
        priority: "required",
        content:
          "Explain the major components, data flow, interfaces, storage, caching, asynchronous processing, and failure handling that are relevant to the proposed system.",
      },
      {
        id: "system-design-tradeoffs",
        role: "system",
        priority: "required",
        content:
          "Explicitly discuss important architectural trade-offs rather than presenting one design as universally correct.",
      },
      {
        id: "system-design-scale",
        role: "system",
        priority: "important",
        content:
          "Use quantitative estimates only when justified by stated assumptions. Clearly label assumptions instead of presenting invented traffic or capacity numbers as facts.",
      },
      {
        id: "system-design-question",
        role: "user",
        priority: "required",
        content: `Work through this system-design interview task:\n${context.question}`,
      },
    ]);
  },
});
