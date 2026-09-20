// ============================================================================
// FILE: core/documents/normalization/WhitespaceNormalizer.ts
// PURPOSE:
// Deterministic whitespace normalization.
//
// IMPORTANT:
// This does NOT collapse all newlines into spaces.
// Document structure depends on meaningful line boundaries.
//
// This class is intentionally synchronous and cancellation-agnostic.
// ============================================================================

export interface WhitespaceNormalizationOptions {
  readonly trimLines?: boolean;

  readonly collapseHorizontalWhitespace?: boolean;

  readonly collapseBlankLines?: boolean;

  readonly maxConsecutiveBlankLines?: number;
}

const DEFAULT_OPTIONS: Required<WhitespaceNormalizationOptions> = {
  trimLines: true,
  collapseHorizontalWhitespace: true,
  collapseBlankLines: true,
  maxConsecutiveBlankLines: 2,
};

export class WhitespaceNormalizer {
  public normalize(
    text: string,
    options: WhitespaceNormalizationOptions = {},
  ): string {
    const config = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    let result = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\u0000/g, "");

    if (config.trimLines) {
      result = result
        .split("\n")
        .map((line) => line.trim())
        .join("\n");
    }

    if (config.collapseHorizontalWhitespace) {
      result = result.replace(/[ \t]+/gu, " ");
    }

    if (config.collapseBlankLines) {
      const max = Math.max(1, Math.floor(config.maxConsecutiveBlankLines));

      const expression = new RegExp(`\\n{${max + 1},}`, "gu");

      result = result.replace(expression, "\n".repeat(max));
    }

    return result.trim();
  }
}
