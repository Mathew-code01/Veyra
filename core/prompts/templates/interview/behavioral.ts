// ============================================================================
// FILE: core/prompts/templates/interview/behavioral.ts
//
// PURPOSE:
// Behavioral interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const BEHAVIORAL_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.behavioral",
  family: "interview",
  kind: "behavioral",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "behavioral";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "behavioral-structure",
        role: "system",
        priority: "required",
        content:
          "Build a natural behavioral interview response using a clear situation, responsibility/task, action, and result structure. Do not force labels into the spoken answer unless useful.",
      },
      {
        id: "behavioral-specificity",
        role: "system",
        priority: "important",
        content:
          "Prefer concrete decisions, actions, trade-offs, collaboration, and measurable outcomes when verified evidence supports them.",
      },
      {
        id: "behavioral-authenticity",
        role: "system",
        priority: "required",
        content:
          "Personal examples must come only from verified candidate evidence. If no suitable personal example is available, provide a transparent placeholder or explain what kind of example is needed rather than inventing one.",
      },
      {
        id: "behavioral-question",
        role: "user",
        priority: "required",
        content: `Answer this behavioral interview question naturally:\n${context.question}`,
      },
    ]);
  },
});
