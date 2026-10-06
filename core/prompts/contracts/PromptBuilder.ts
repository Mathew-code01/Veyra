// ============================================================================
// FILE: core/prompts/contracts/PromptBuilder.ts
//
// PURPOSE:
// Contract implemented by prompt builders.
//
// Builders compose domain-independent prompt instructions from already
// resolved application data.
// ============================================================================

import type {
  PromptBuildInput,
  PromptInstructionSet,
  PromptFamily,
  PromptKind,
} from "./PromptTypes";

export interface PromptBuilder<
  TInput extends PromptBuildInput = PromptBuildInput,
> {
  readonly family: PromptFamily;

  readonly kind: PromptKind;

  /**
   * Determine whether this builder can handle the supplied input.
   */
  canBuild(input: TInput): boolean;

  /**
   * Build a deterministic prompt instruction set.
   */
  build(input: TInput): PromptInstructionSet;
}
