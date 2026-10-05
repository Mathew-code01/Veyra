
// ============================================================================
// FILE: shared/constants/interviewTypes.ts
//
// PURPOSE:
// Canonical interview taxonomy shared across Veyra.
//
// ARCHITECTURAL RULE:
//
// Conversation asks:
//     "What is happening linguistically/conversationally?"
//
// Interview asks:
//     "What interview activity/task is happening?"
//
// This file contains classification vocabulary only.
// It contains no classification logic.
// ============================================================================

export const INTERVIEW_TYPES = [
  "behavioral",
  "technical",
  "coding",
  "system_design",
  "case",
  "product",
  "communication",
  "experience",
  "motivation",
  "situational",
  "general",
] as const;

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_TYPE_LABELS: Readonly<
  Record<InterviewType, string>
> = {
  behavioral: "Behavioral",
  technical: "Technical",
  coding: "Coding",
  system_design: "System Design",
  case: "Case",
  product: "Product",
  communication: "Communication",
  experience: "Experience",
  motivation: "Motivation",
  situational: "Situational",
  general: "General",
};

export const INTERVIEW_TYPE_DESCRIPTIONS: Readonly<
  Record<InterviewType, string>
> = {
  behavioral:
    "Questions about past behavior, decisions, challenges, teamwork, leadership, and outcomes.",

  technical:
    "Questions testing technical knowledge, concepts, technologies, debugging, or engineering judgment.",

  coding:
    "Programming, algorithmic reasoning, implementation, debugging, or code-writing tasks.",

  system_design:
    "Architecture, scalability, reliability, distributed systems, APIs, infrastructure, and system trade-offs.",

  case:
    "Structured business, analytical, operational, or problem-solving case exercises.",

  product:
    "Product strategy, product thinking, prioritization, users, metrics, and product decisions.",

  communication:
    "Communication, explanation, presentation, collaboration, or interpersonal communication assessment.",

  experience:
    "Questions about the candidate's background, work history, projects, education, or experience.",

  motivation:
    "Questions about motivation, goals, interests, company fit, role fit, and career direction.",

  situational:
    "Hypothetical workplace scenarios and questions about how the candidate would respond.",

  general:
    "Interview activity that cannot yet be confidently assigned to another category.",
};

export function isInterviewType(value: unknown): value is InterviewType {
  return (
    typeof value === "string" &&
    (INTERVIEW_TYPES as readonly string[]).includes(value)
  );
}
