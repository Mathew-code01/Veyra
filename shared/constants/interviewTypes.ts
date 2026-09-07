// shared/constants/interviewTypes.ts

/**
 * Supported interview types.
 */
export const INTERVIEW_TYPES = Object.freeze([
  "behavioral",
  "technical",
  "coding",
  "system-design",
  "product",
  "case",
  "communication",
  "mixed",
  "unknown",
] as const);

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

/**
 * Human-readable labels.
 */
export const INTERVIEW_TYPE_LABELS: Readonly<Record<InterviewType, string>> =
  Object.freeze({
    behavioral: "Behavioral",
    technical: "Technical",
    coding: "Coding",
    "system-design": "System Design",
    product: "Product",
    case: "Case",
    communication: "Communication",
    mixed: "Mixed",
    unknown: "Unknown",
  });

/**
 * Product-facing descriptions.
 */
export const INTERVIEW_TYPE_DESCRIPTIONS: Readonly<
  Record<InterviewType, string>
> = Object.freeze({
  behavioral:
    "Questions about experience, behavior, achievements and past situations.",

  technical:
    "Questions about technical concepts, implementation and engineering decisions.",

  coding:
    "Programming, algorithms, data structures and implementation problems.",

  "system-design":
    "Architecture, scalability, reliability, APIs, databases and distributed systems.",

  product: "Product thinking, users, metrics, prioritization and trade-offs.",

  case: "Structured problem solving, assumptions, analysis and recommendations.",

  communication:
    "Communication, collaboration, explanation and interpersonal scenarios.",

  mixed: "A session containing multiple interview styles.",

  unknown: "Interview type has not yet been determined.",
});

/**
 * Runtime validation helper.
 */
export function isInterviewType(value: unknown): value is InterviewType {
  return (
    typeof value === "string" &&
    (INTERVIEW_TYPES as readonly string[]).includes(value)
  );
}
