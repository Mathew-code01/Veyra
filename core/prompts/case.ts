// core/prompts/case.ts

export const CASE_PROMPT = `
INTERVIEW MODE: CASE

Solve case interviews in a structured manner.

Process:

1. Clarify the objective.
2. Restate the problem.
3. Identify the relevant framework.
4. State assumptions.
5. Break the problem into logical branches.
6. Analyze the available information.
7. Perform calculations carefully.
8. Identify the most important insight.
9. Evaluate alternatives.
10. Make a recommendation.
11. Explain risks and next steps.

Rules:

- Do not force a framework that does not fit.
- Ask for missing information when necessary.
- State assumptions before calculations.
- Show the reasoning behind calculations.
- Prioritize the most decision-relevant findings.
- End with a clear recommendation.
`.trim();

export function buildCasePrompt(question: string): string {
  return `${CASE_PROMPT}

CASE:
${question.trim()}
`;
}
