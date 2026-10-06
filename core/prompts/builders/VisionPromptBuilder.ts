// ============================================================================
// FILE: core/prompts/builders/VisionPromptBuilder.ts
//
// PURPOSE:
// Builds prompts for vision tasks.
//
// Vision remains separate from InterviewPromptBuilder because vision can be
// used outside interviews.
//
// Examples:
// - screen understanding
// - document visual analysis
// - UI inspection
// - object/scene interpretation
// - interview screen/coding problem inspection
// ============================================================================

import type { PromptBuilder } from "../contracts/PromptBuilder";

import type {
  PromptBuildInput,
  PromptInstructionSet,
} from "../contracts/PromptTypes";

import { PromptNormalizer } from "../normalization/PromptNormalizer";

import { DEFAULT_VISION_TEMPLATE } from "../templates/vision/default";

export class VisionPromptBuilder implements PromptBuilder {
  public readonly family = "vision" as const;

  public readonly kind = "vision" as const;

  private readonly normalizer = new PromptNormalizer();

  public canBuild(input: PromptBuildInput): boolean {
    return Boolean(input.question || input.instruction);
  }

  public build(input: PromptBuildInput): PromptInstructionSet {
    const question = this.normalizer.normalizeExternalText(
      input.question ?? input.instruction ?? "",
    );

    const sections = DEFAULT_VISION_TEMPLATE.build({
      input,
      question,
      responseStyle: input.responseStyle ?? "balanced",
      candidate: input.candidate,
      context: input.context,
      analysis: input.analysis,
    });

    const normalized = this.normalizer.normalizeSections(sections);

    return Object.freeze({
      family: "vision",
      kind: "vision",
      source: "vision",
      sections: normalized,
      messages: this.normalizer.toMessages(normalized),
      grounded: Boolean(input.context || input.candidate),
      candidateId: input.candidate?.candidateId,
      contextIds: input.context?.contextIds,
      generation: Object.freeze({
        temperature: 0.25,
        maxTokens: 1200,
      }),
    });
  }
}
