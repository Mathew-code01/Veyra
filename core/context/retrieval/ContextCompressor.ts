// core/context/ContextCompressor.ts

import type { RankedContext } from "./ContextRanker";

export interface CompressedContext {
  readonly text: string;
  readonly sourceCount: number;
  readonly tokenEstimate: number;
  readonly contexts: readonly RankedContext[];
}

export interface ContextCompressorOptions {
  readonly maxCharacters?: number;
}

export class ContextCompressor {
  private readonly maxCharacters: number;

  public constructor(options: ContextCompressorOptions = {}) {
    this.maxCharacters = Math.max(500, options.maxCharacters ?? 8000);
  }

  public compress(contexts: readonly RankedContext[]): CompressedContext {
    const selected: RankedContext[] = [];
    const sections: string[] = [];

    let characterCount = 0;

    for (const context of contexts) {
      const section = this.formatContext(context);

      if (characterCount + section.length > this.maxCharacters) {
        break;
      }

      selected.push(context);
      sections.push(section);

      characterCount += section.length;
    }

    const text = sections.join("\n\n");

    return {
      text,
      sourceCount: selected.length,
      tokenEstimate: this.estimateTokens(text),
      contexts: selected,
    };
  }

  private formatContext(context: RankedContext): string {
    const type = String(context.metadata.type ?? "context");

    const source =
      context.metadata.documentName ??
      context.metadata.fileName ??
      context.documentId;

    return [
      `[${type.toUpperCase()}]`,
      `Source: ${source}`,
      `Relevance: ${context.rankScore.toFixed(3)}`,
      context.text.trim(),
    ].join("\n");
  }

  private estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }

    return Math.ceil(text.length / 4);
  }
}