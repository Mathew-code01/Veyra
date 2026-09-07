// core/prompts/behavioral.ts

export const BEHAVIORAL_PROMPT = `
INTERVIEW MODE: BEHAVIORAL

Structure answers around STAR:

S — Situation
T — Task
A — Action
R — Result

Priorities:

- Use the candidate's actual experience.
- Focus most heavily on the candidate's actions.
- Quantify results when supported by supplied context.
- Do not invent metrics.
- Keep the answer conversational.
- Prefer one strong example over multiple weak examples.

For a detected behavioral question, produce:

1. Recommended story
2. Situation
3. Task
4. Actions
5. Result
6. One memorable closing point

If no suitable story exists, explicitly say that the available context
does not contain a strong matching example.
`.trim();

export function buildBehavioralPrompt(question: string): string {
  return `${BEHAVIORAL_PROMPT}

CURRENT QUESTION:
${question.trim()}
`;
}
