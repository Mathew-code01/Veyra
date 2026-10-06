// ============================================================================
// FILE: core/prompts/contracts/PromptTemplate.ts
//
// PURPOSE:
// Contract for individual prompt templates.
//
// Templates contain task-specific instruction knowledge.
// They do not retrieve context and do not execute AI.
// ============================================================================

import type {
  PromptSection,
  PromptTemplateContext,
  PromptFamily,
  PromptKind,
  PromptSource,
} from "./PromptTypes";

export interface PromptTemplate {
  readonly id: string;

  readonly family: PromptFamily;

  readonly kind: PromptKind;

  readonly source: PromptSource;

  /**
   * Human-readable version identifier.
   */
  readonly version: string;

  /**
   * Optional description for diagnostics/admin tooling.
   */
  readonly description?: string;

  /**
   * Whether this template can handle the supplied context.
   */
  canHandle(context: PromptTemplateContext): boolean;

  /**
   * Build semantic prompt sections.
   */
  build(context: PromptTemplateContext): readonly PromptSection[];
}
