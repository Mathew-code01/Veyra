// shared/constants/interviewTypes.ts

/**
 * High-level interview/task categories supported by Veyra.
 *
 * These describe the nature of the interview task.
 *
 * They do NOT describe conversational behavior.
 */
export const INTERVIEW_TYPES = Object.freeze([
  "behavioral",
  "technical",
  "coding",
  "system-design",
  "product",
  "case",
  "communication",
  "experience",
  "motivation",
  "situational",
  "general",
  "mixed",
  "unknown",
] as const);

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_TYPE_LABELS: Readonly<Record<InterviewType, string>> =
  Object.freeze({
    behavioral: "Behavioral",
    technical: "Technical",
    coding: "Coding",
    "system-design": "System Design",
    product: "Product",
    case: "Case",
    communication: "Communication",
    experience: "Experience",
    motivation: "Motivation",
    situational: "Situational",
    general: "General",
    mixed: "Mixed",
    unknown: "Unknown",
  });

export const INTERVIEW_TYPE_DESCRIPTIONS: Readonly<
  Record<InterviewType, string>
> = Object.freeze({
  behavioral:
    "Questions about past experiences, behavior, achievements, challenges and situations.",

  technical:
    "Questions about technical concepts, engineering decisions, implementation and technical reasoning.",

  coding:
    "Programming, algorithms, data structures, debugging and implementation tasks.",

  "system-design":
    "Architecture, scalability, reliability, APIs, data systems and distributed-system decisions.",

  product:
    "Users, product decisions, metrics, prioritization, experimentation and trade-offs.",

  case: "Structured problem solving, assumptions, analysis, quantitative or qualitative reasoning and recommendations.",

  communication:
    "Communication, explanation, collaboration, stakeholder interaction and interpersonal scenarios.",

  experience:
    "Questions about the candidate's background, work history, projects, responsibilities and achievements.",

  motivation:
    "Questions about goals, interests, career motivations, role motivations and company motivations.",

  situational:
    "Hypothetical or scenario-based questions requiring judgment or decision-making.",

  general:
    "General interview questions that do not fit a more specific category.",

  mixed: "A conversation containing multiple interview or task categories.",

  unknown: "The interview or task category has not yet been determined.",
});

export function isInterviewType(value: unknown): value is InterviewType {
  return (
    typeof value === "string" &&
    (INTERVIEW_TYPES as readonly string[]).includes(value)
  );
}
