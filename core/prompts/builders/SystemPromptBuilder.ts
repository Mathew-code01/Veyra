// ============================================================================
// FILE: core/prompts/builders/SystemPromptBuilder.ts
//
// PURPOSE:
// Builds the universal Veyra system instructions.
//
// This is deliberately separate from interview-specific instructions.
//
// SYSTEM PROMPT RESPONSIBILITY:
// - truthfulness
// - grounding
// - candidate-fact safety
// - concise/direct response behavior
// - interview-assistant behavior
//
// It does NOT:
// - retrieve context
// - decide interview classification
// - select a model
// ============================================================================

import type { PromptBuilder } from "../contracts/PromptBuilder";

import type {
  PromptBuildInput,
  PromptInstructionSet,
} from "../contracts/PromptTypes";

import { PromptNormalizer } from "../normalization/PromptNormalizer";

import { DEFAULT_SYSTEM_TEMPLATE } from "../templates/system/default";

export class SystemPromptBuilder implements PromptBuilder {
  public readonly family = "system" as const;

  public readonly kind = "default" as const;

  private readonly normalizer = new PromptNormalizer();

  public canBuild(_input: PromptBuildInput): boolean {
    return true;
  }

  public build(input: PromptBuildInput): PromptInstructionSet {
    const sections = DEFAULT_SYSTEM_TEMPLATE.build({
      input,
      analysis: input.analysis,
      question:
        input.question ??
        input.analysis?.currentTask?.questionText ??
        input.analysis?.conversation.turn.text ??
        "",
      candidate: input.candidate,
      context: input.context,
      responseStyle: input.responseStyle ?? "interview-ready",
    });

    const normalized = this.normalizer.normalizeSections(sections);

    return Object.freeze({
      family: "system",
      kind: "default",
      source: "system",
      sections: normalized,
      messages: this.normalizer.toMessages(normalized),
      grounded: Boolean(input.candidate || input.context),
      candidateId: input.candidate?.candidateId,
      contextIds: input.context?.contextIds,
    });
  }
}
