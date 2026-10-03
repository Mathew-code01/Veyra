// ============================================================================
// FILE: core/context/retrieval/ContextCompressor.ts
//
// PURPOSE:
// Compress ranked Context into a bounded textual representation.
//
// This is generic.
// It does not know whether the information came from:
// - a document
// - Vision
// - Audio
// - Conversation
// - Candidate
// - Memory
// - Web
// - Tool output
// ============================================================================

import type {
  CompressedContext,
  RankedContext,
} from "../contracts/ContextQuery";

import { estimateTokens } from "../ingestion/Chunker";

export interface ContextCompressorOptions {
  readonly maxCharacters?: number;

  readonly separator?: string;
}

export class ContextCompressor {
  private readonly maxCharacters: number;

  private readonly separator: string;

  public constructor(options: ContextCompressorOptions = {}) {
    const maxCharacters = options.maxCharacters ?? 8000;

    if (!Number.isSafeInteger(maxCharacters) || maxCharacters <= 0) {
      throw new RangeError(
        "Context compressor maxCharacters must be a positive safe integer.",
      );
    }

    this.maxCharacters = maxCharacters;

    this.separator = options.separator ?? "\n\n";
  }

  public compress(contexts: readonly RankedContext[]): CompressedContext {
    if (!Array.isArray(contexts)) {
      throw new TypeError("Contexts must be an array.");
    }

    if (contexts.length === 0) {
      return {
        text: "",

        sourceCount: 0,

        tokenEstimate: 0,

        contexts: [],
      };
    }

    const selected: RankedContext[] = [];

    const parts: string[] = [];

    let currentLength = 0;

    for (const context of contexts) {
      const formatted = this.formatContext(context);

      const separatorLength = parts.length > 0 ? this.separator.length : 0;

      if (
        currentLength + separatorLength + formatted.length >
        this.maxCharacters
      ) {
        break;
      }

      parts.push(formatted);

      selected.push(context);

      currentLength += separatorLength + formatted.length;
    }

    const text = parts.join(this.separator);

    return {
      text,

      sourceCount: selected.length,

      tokenEstimate: estimateTokens(text),

      contexts: selected,
    };
  }

  private formatContext(context: RankedContext): string {
    const source =
      context.source.name ?? context.source.id ?? context.source.type;

    return [
      `[source=${source}]`,

      `[type=${context.contentType}]`,

      context.text.trim(),
    ].join(" ");
  }
}
