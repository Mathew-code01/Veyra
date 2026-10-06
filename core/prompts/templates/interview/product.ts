// ============================================================================
// FILE: core/prompts/templates/interview/product.ts
//
// PURPOSE:
// Product interview prompt strategy.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const PRODUCT_PROMPT_TEMPLATE: PromptTemplate = Object.freeze({
  id: "interview.product",
  family: "interview",
  kind: "product",
  source: "template",
  version: "1.0.0",

  canHandle(context: PromptTemplateContext): boolean {
    return context.analysis?.classification.type === "product";
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "product-user",
        role: "system",
        priority: "required",
        content:
          "For product questions, identify the target user, problem, desired outcome, and relevant constraints before recommending a solution.",
      },
      {
        id: "product-prioritization",
        role: "system",
        priority: "important",
        content:
          "When prioritization is involved, make the decision criteria explicit and explain the trade-offs.",
      },
      {
        id: "product-metrics",
        role: "system",
        priority: "important",
        content:
          "Use meaningful success metrics when appropriate. Distinguish leading indicators from business or outcome metrics where useful.",
      },
      {
        id: "product-question",
        role: "user",
        priority: "required",
        content: `Answer this product interview question:\n${context.question}`,
      },
    ]);
  },
});
