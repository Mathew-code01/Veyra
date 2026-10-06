// ============================================================================
// FILE: core/prompts/registry/PromptRegistry.ts
//
// PURPOSE:
// Runtime registry for prompt templates.
//
// The registry allows Veyra to add/replace prompt templates without changing
// PromptService.
//
// It does NOT register AI providers.
// ============================================================================

import type {
  PromptFamily,
  PromptKind,
  PromptTemplateContext,
} from "../contracts/PromptTypes";

import type { PromptTemplate } from "../contracts/PromptTemplate";

export interface PromptRegistryKey {
  readonly family: PromptFamily;

  readonly kind: PromptKind;
}

export class PromptRegistry {
  private readonly templates = new Map<string, PromptTemplate>();

  /**
   * Register a template.
   */
  public register(template: PromptTemplate, replaceExisting = true): void {
    if (!template) {
      throw new Error("Prompt template is required.");
    }

    const key = this.createKey(template.family, template.kind);

    if (this.templates.has(key) && !replaceExisting) {
      throw new Error(`Prompt template "${key}" is already registered.`);
    }

    this.templates.set(key, template);
  }

  /**
   * Remove a template.
   */
  public unregister(family: PromptFamily, kind: PromptKind): boolean {
    return this.templates.delete(this.createKey(family, kind));
  }

  /**
   * Retrieve an exact template.
   */
  public get(
    family: PromptFamily,
    kind: PromptKind,
  ): PromptTemplate | undefined {
    return this.templates.get(this.createKey(family, kind));
  }

  /**
   * Find the first template capable of handling a context.
   */
  public find(context: PromptTemplateContext): PromptTemplate | undefined {
    const exact = this.get(
      context.analysis ? "interview" : "system",
      context.analysis?.classification.type ?? "default",
    );

    if (exact && exact.canHandle(context)) {
      return exact;
    }

    for (const template of this.templates.values()) {
      if (template.canHandle(context)) {
        return template;
      }
    }

    return undefined;
  }

  /**
   * Return an immutable template snapshot.
   */
  public list(): readonly PromptTemplate[] {
    return Object.freeze([...this.templates.values()]);
  }

  /**
   * Check exact registration.
   */
  public has(family: PromptFamily, kind: PromptKind): boolean {
    return this.templates.has(this.createKey(family, kind));
  }

  private createKey(family: PromptFamily, kind: PromptKind): string {
    return `${family}:${kind}`;
  }
}
