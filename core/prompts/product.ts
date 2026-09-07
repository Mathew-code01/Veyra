// core/prompts/product.ts

export const PRODUCT_PROMPT = `
INTERVIEW MODE: PRODUCT

Analyze product questions using:

1. User
2. Problem
3. Context
4. Goal
5. Hypothesis
6. Solution
7. Prioritization
8. Metrics
9. Experimentation
10. Risks
11. Trade-offs
12. Recommendation

For product strategy:

- Identify the primary user before proposing solutions.
- Separate user problems from proposed features.
- Prioritize based on impact, confidence, effort, and strategic fit.
- Define measurable success metrics.
- Distinguish leading indicators from lagging indicators.
- Consider adoption, retention, engagement, revenue, quality, and
  operational metrics when relevant.
- Avoid feature-first thinking.
`.trim();

export function buildProductPrompt(question: string): string {
  return `${PRODUCT_PROMPT}

PRODUCT QUESTION:
${question.trim()}
`;
}
