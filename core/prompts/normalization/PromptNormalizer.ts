// ============================================================================
// FILE: core/prompts/normalization/PromptNormalizer.ts
//
// PURPOSE:
// Deterministically normalizes prompt sections into clean AI messages.
//
// RESPONSIBILITIES:
// - remove accidental empty sections
// - normalize whitespace
// - preserve message ordering
// - prevent duplicated role sections where appropriate
// - remove obviously unsafe prompt-control artifacts
//
// DOES NOT:
// - call AI
// - retrieve context
// - modify candidate facts
// - rewrite domain meaning
// ============================================================================

import type { AIMessage } from "../../../shared/types/ai";

import type {
  PromptSection,
  PromptInstructionSet,
} from "../contracts/PromptTypes";

export class PromptNormalizer {
  /**
   * Normalize individual prompt sections.
   */
  public normalizeSections(
    sections: readonly PromptSection[],
  ): readonly PromptSection[] {
    const normalized: PromptSection[] = [];

    for (const section of sections) {
      if (!section) {
        continue;
      }

      const id = section.id.trim();

      const content = this.normalizeText(section.content);

      if (!id || !content) {
        continue;
      }

      normalized.push(
        Object.freeze({
          id,
          role: section.role,
          content,
          priority: section.priority,
        }),
      );
    }

    return Object.freeze(normalized);
  }

  /**
   * Convert semantic sections into canonical AI messages.
   */
  public toMessages(sections: readonly PromptSection[]): readonly AIMessage[] {
    const normalized = this.normalizeSections(sections);

    return Object.freeze(
      normalized.map((section) =>
        Object.freeze({
          role: section.role,
          content: section.content,
        }),
      ),
    );
  }

  /**
   * Normalize a complete instruction set.
   */
  public normalize(prompt: PromptInstructionSet): PromptInstructionSet {
    const sections = this.normalizeSections(prompt.sections);

    const messages = this.toMessages(sections);

    return Object.freeze({
      ...prompt,
      sections,
      messages,
    });
  }

  /**
   * Normalize whitespace without changing substantive content.
   */
  public normalizeText(value: string): string {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Prevent prompt-injection-like delimiter strings from accidentally
   * masquerading as internal control markers.
   *
   * This is deliberately conservative. It does not attempt to "sanitize"
   * natural language or rewrite user content.
   */
  public normalizeExternalText(value: string): string {
    return this.normalizeText(value)
      .replace(/<\|system\|>/gi, "")
      .replace(/<\|assistant\|>/gi, "")
      .replace(/<\|user\|>/gi, "");
  }
}
