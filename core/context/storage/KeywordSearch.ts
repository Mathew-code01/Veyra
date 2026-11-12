export function tokenizeSearchQuery(query: string): string[] {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu) ?? [];

  return [...new Set(tokens.map((token) => token.toLowerCase()))]
    .filter((token) => token.length > 1)
    .slice(0, 12);
}

export function scoreKeywordOverlap(
  text: string,
  terms: readonly string[],
): number {
  if (terms.length === 0) {
    return 0;
  }

  const textTerms = new Set(
    (text.match(/[\p{L}\p{N}_]+/gu) ?? []).map((token) => token.toLowerCase()),
  );
  const matches = terms.filter((term) => textTerms.has(term)).length;

  return matches / terms.length;
}
