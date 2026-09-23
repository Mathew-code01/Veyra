/**
 * Normalizes transcript text before conversational analysis.
 *
 * Responsibility:
 * - normalize whitespace
 * - normalize common transcript artifacts
 * - preserve semantic content
 *
 * It must NOT:
 * - classify intent
 * - classify interview type
 * - infer candidate facts
 * - call an AI model
 */

export interface ConversationTextNormalizerOptions {
  readonly removeRepeatedWhitespace?: boolean;
  readonly normalizeUnicodePunctuation?: boolean;
}

export class ConversationTextNormalizer {
  private readonly removeRepeatedWhitespace: boolean;
  private readonly normalizeUnicodePunctuation: boolean;

  constructor(options: ConversationTextNormalizerOptions = {}) {
    this.removeRepeatedWhitespace = options.removeRepeatedWhitespace ?? true;

    this.normalizeUnicodePunctuation =
      options.normalizeUnicodePunctuation ?? true;
  }

  normalize(text: string): string {
    let value = text.normalize("NFKC").trim();

    if (this.normalizeUnicodePunctuation) {
      value = value
        .replace(/[“”„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...");
    }

    if (this.removeRepeatedWhitespace) {
      value = value.replace(/\s+/g, " ");
    }

    return value.trim();
  }
}
