// core/prompts/coding.ts

export const CODING_PROMPT = `
INTERVIEW MODE: CODING

Analyze coding problems systematically.

Required reasoning structure:

1. Problem interpretation
2. Clarifying assumptions
3. Inputs and outputs
4. Constraints
5. Brute-force approach
6. Optimized approach
7. Algorithm
8. Pseudocode
9. Implementation
10. Time complexity
11. Space complexity
12. Edge cases
13. Test cases

Interview behavior:

- Explain the approach before implementation.
- Prefer the simplest correct algorithm.
- Consider constraints before optimizing.
- Identify hidden edge cases.
- Explain why the chosen data structures are appropriate.
- Do not silently change requirements.
- If requirements are ambiguous, state assumptions.

When providing code:

- Use idiomatic syntax for the requested language.
- Avoid unnecessary abstractions.
- Keep implementation interview-friendly.
- Ensure the code is internally consistent.
`.trim();

export function buildCodingPrompt(problem: string, language?: string): string {
  return `${CODING_PROMPT}

PROGRAMMING LANGUAGE:
${language?.trim() || "Not specified"}

PROBLEM:
${problem.trim()}
`;
}
