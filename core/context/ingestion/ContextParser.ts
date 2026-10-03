// ============================================================================
// FILE: core/context/ingestion/ContextParser.ts
//
// PURPOSE:
// Generic Context input validation/normalization.
//
// IMPORTANT:
// This is NOT a PDF/DOCX/Markdown parser.
//
// Document parsing belongs to core/documents.
//
// This parser only converts already-available textual information into the
// generic ContextItem representation.
//
// Possible callers:
// - conversation
// - memory
// - web
// - tool
// - generated content
// - application state
// - simple document adapters
// ============================================================================

import type { ContextInput, ContextItem } from "../contracts/ContextTypes";

// ============================================================================
// CONTRACT
// ============================================================================

export interface ContextParser {
  parse(input: ContextInput): ContextItem;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class DefaultContextParser implements ContextParser {
  public parse(input: ContextInput): ContextItem {
    this.validateInput(input);

    const now = new Date().toISOString();

    const createdAt = input.createdAt ?? now;

    const updatedAt = input.updatedAt ?? createdAt;

    return {
      id: input.id.trim(),

      name: input.name.trim(),

      contentType: input.contentType,

      source: {
        ...input.source,

        type: input.source.type,

        id: input.source.id?.trim() || undefined,

        name: input.source.name?.trim() || undefined,

        uri: input.source.uri?.trim() || undefined,
      },

      scope: input.scope,

      text: input.text,

      metadata: {
        ...(input.metadata ?? {}),
      },

      createdAt,

      updatedAt,
    };
  }

  private validateInput(input: ContextInput): void {
    if (!input) {
      throw new Error("Context input is required.");
    }

    if (typeof input.id !== "string" || !input.id.trim()) {
      throw new Error("Context input requires a non-empty ID.");
    }

    if (typeof input.name !== "string" || !input.name.trim()) {
      throw new Error(`Context "${input.id}" requires a non-empty name.`);
    }

    if (typeof input.contentType !== "string" || !input.contentType.trim()) {
      throw new Error(`Context "${input.id}" requires a content type.`);
    }

    if (!input.source || typeof input.source !== "object") {
      throw new Error(`Context "${input.id}" requires source provenance.`);
    }

    if (typeof input.source.type !== "string" || !input.source.type.trim()) {
      throw new Error(`Context "${input.id}" requires a source type.`);
    }

    if (typeof input.text !== "string") {
      throw new Error(`Context "${input.id}" must contain text.`);
    }

    if (!input.text.trim()) {
      throw new Error(`Context "${input.id}" contains no usable text.`);
    }

    if (input.createdAt !== undefined && !isValidDateString(input.createdAt)) {
      throw new Error(
        `Context "${input.id}" contains an invalid createdAt timestamp.`,
      );
    }

    if (input.updatedAt !== undefined && !isValidDateString(input.updatedAt)) {
      throw new Error(
        `Context "${input.id}" contains an invalid updatedAt timestamp.`,
      );
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function isValidDateString(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}
