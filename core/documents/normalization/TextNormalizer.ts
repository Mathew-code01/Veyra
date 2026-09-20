// ============================================================================
// FILE: core/documents/normalization/TextNormalizer.ts
// PURPOSE:
// Canonical text normalization.
//
// Responsibilities:
// - Unicode normalization
// - BOM removal
// - control-character cleanup
// - newline normalization
// - whitespace normalization
//
// It does NOT perform semantic document parsing.
// ============================================================================

import { WhitespaceNormalizer } from "./WhitespaceNormalizer";

export interface TextNormalizationOptions {
  readonly unicodeForm?: "NFC" | "NFD" | "NFKC" | "NFKD";

  readonly normalizeWhitespace?: boolean;

  readonly removeControlCharacters?: boolean;
}

const DEFAULT_OPTIONS: Required<TextNormalizationOptions> = {
  unicodeForm: "NFC",
  normalizeWhitespace: true,
  removeControlCharacters: true,
};

export class TextNormalizer {
  private readonly whitespaceNormalizer: WhitespaceNormalizer;

  public constructor(
    whitespaceNormalizer: WhitespaceNormalizer = new WhitespaceNormalizer(),
  ) {
    this.whitespaceNormalizer = whitespaceNormalizer;
  }

  public normalize(
    text: string,
    options: TextNormalizationOptions = {},
  ): string {
    const config = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    let result = text;

    /**
     * Remove UTF-8 BOM.
     */
    if (result.startsWith("\uFEFF")) {
      result = result.slice(1);
    }

    /**
     * Normalize newline representation.
     */
    result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    /**
     * Remove null bytes.
     */
    result = result.replace(/\u0000/g, "");

    if (config.removeControlCharacters) {
      result = removeUnsafeControlCharacters(result);
    }

    /**
     * Unicode normalization prevents visually
     * identical strings from having different
     * underlying representations.
     */
    if (typeof result.normalize === "function") {
      result = result.normalize(config.unicodeForm);
    }

    if (config.normalizeWhitespace) {
      result = this.whitespaceNormalizer.normalize(result);
    }

    return result;
  }
}

function removeUnsafeControlCharacters(text: string): string {
  return Array.from(text)
    .filter((character) => {
      const code = character.charCodeAt(0);

      /**
       * Preserve:
       * - newline
       * - tab
       *
       * Remove other C0 controls.
       */
      if (code < 32 && code !== 9 && code !== 10) {
        return false;
      }

      /**
       * DEL and C1 controls.
       */
      if (code >= 127 && code <= 159) {
        return false;
      }

      return true;
    })
    .join("");
}
