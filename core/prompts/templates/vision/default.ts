// ============================================================================
// FILE: core/prompts/templates/vision/default.ts
//
// PURPOSE:
// Canonical vision-analysis prompt.
// ============================================================================

import type { PromptTemplate } from "../../contracts/PromptTemplate";

import type {
  PromptSection,
  PromptTemplateContext,
} from "../../contracts/PromptTypes";

export const DEFAULT_VISION_TEMPLATE: PromptTemplate = Object.freeze({
  id: "vision.default",
  family: "vision",
  kind: "vision",
  source: "vision",
  version: "1.0.0",
  description: "General visual understanding instructions.",

  canHandle(_context: PromptTemplateContext): boolean {
    return true;
  },

  build(context: PromptTemplateContext): readonly PromptSection[] {
    return Object.freeze([
      {
        id: "vision-role",
        role: "system",
        priority: "required",
        content:
          "Analyze the supplied visual input carefully and describe only information that can reasonably be supported by what is visible.",
      },

      {
        id: "vision-task",
        role: "user",
        priority: "required",
        content: [
          "Visual analysis task:",
          context.question ||
            "Describe the important information visible in the image.",
        ].join("\n"),
      },

      {
        id: "vision-accuracy",
        role: "system",
        priority: "required",
        content:
          "Distinguish visible facts from interpretation. If text is partially obscured or unreadable, do not invent the missing content.",
      },

      {
        id: "vision-relevance",
        role: "system",
        priority: "important",
        content:
          "Focus on information relevant to the requested task rather than producing an exhaustive description of irrelevant visual details.",
      },
    ]);
  },
});
