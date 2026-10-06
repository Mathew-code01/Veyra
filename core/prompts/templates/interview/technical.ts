// ============================================================================
// FILE: core/prompts/templates/interview/technical.ts
//
// PURPOSE:
// Technical interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const TECHNICAL_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.technical",
  family: "interview",
  kind: "technical",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "technical";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "technical-answer",
        role: "system",
        priority: "required",
        content:
          "Give a technically accurate answer. Start with the direct concept, then explain how it works, why it matters, and relevant trade-offs when appropriate.",
      },
      {
        id: "technical-depth",
        role: "system",
        priority: "important",
        content:
          "Match depth to the question. Avoid unnecessary textbook exposition when a concise interview-ready explanation is sufficient.",
      },
      {
        id: "technical-uncertainty",
        role: "system",
        priority: "required",
        content:
          "Do not invent APIs, framework behavior, benchmarks, versions, or implementation details. If a detail depends on a version or environment, state that dependency.",
      },
      {
        id: "technical-question",
        role: "user",
        priority: "required",
        content: `Answer this technical interview question:\n${context.question}`,
      },
    ]);
  },
});
