// ============================================================================
// FILE: core/prompts/templates/interview/coding.ts
//
// PURPOSE:
// Coding interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const CODING_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.coding",
  family: "interview",
  kind: "coding",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "coding";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "coding-reasoning",
        role: "system",
        priority: "required",
        content:
          "For coding tasks, reason from the problem requirements before presenting implementation details. Identify assumptions, inputs, outputs, edge cases, and constraints when relevant.",
      },
      {
        id: "coding-complexity",
        role: "system",
        priority: "important",
        content:
          "Explain time and space complexity for algorithmic solutions when that information is relevant to the interview task.",
      },
      {
        id: "coding-correctness",
        role: "system",
        priority: "required",
        content:
          "Prefer correct, readable, maintainable code over unnecessarily clever solutions. Explicitly consider important edge cases.",
      },
      {
        id: "coding-question",
        role: "user",
        priority: "required",
        content: `Solve or explain this coding interview task:\n${context.question}`,
      },
    ]);
  },
});
