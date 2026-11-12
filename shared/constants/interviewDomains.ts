// ============================================================================
// FILE: shared/constants/interviewDomains.ts
//
// PURPOSE:
// Canonical professional interview domains and taxonomy for Veyra.
//
// ARCHITECTURAL RULE:
// Veyra is a general-purpose interview copilot across all major professional
// domains, not only a software engineering or tech assistant.
// ============================================================================

export const INTERVIEW_DOMAINS = [
  "software_engineering",
  "data_and_analytics",
  "finance_and_accounting",
  "economics",
  "business_and_management",
  "sales_and_marketing",
  "customer_service",
  "human_resources",
  "healthcare_and_clinical",
  "education_and_academic",
  "engineering_and_trades",
  "operations_and_logistics",
  "consulting_and_strategy",
  "behavioral_and_competency",
  "situational",
  "leadership_and_management",
  "academic_and_research",
  "general_employment",
  "technical",
  "mixed_domain",
] as const;

export type InterviewDomain = (typeof INTERVIEW_DOMAINS)[number];

export const INTERVIEW_DOMAIN_LABELS: Readonly<Record<InterviewDomain, string>> = {
  software_engineering: "Software Engineering & IT",
  data_and_analytics: "Data Science, Analytics & AI",
  finance_and_accounting: "Finance, Accounting & Economics",
  economics: "Economics & Market Analysis",
  business_and_management: "Business Management & Administration",
  sales_and_marketing: "Sales, Marketing & Customer Success",
  customer_service: "Customer Service & Client Support",
  human_resources: "Human Resources & Talent Acquisition",
  healthcare_and_clinical: "Healthcare & Clinical Roles",
  education_and_academic: "Education & Teaching",
  engineering_and_trades: "Engineering & Technical Trades",
  operations_and_logistics: "Operations, Logistics & Supply Chain",
  consulting_and_strategy: "Consulting & Strategy",
  behavioral_and_competency: "Behavioral & Competency-Based",
  situational: "Situational & Scenario-Based",
  leadership_and_management: "Leadership & People Management",
  academic_and_research: "Academic, Scientific & Research",
  general_employment: "General Employment & Entry-Level",
  technical: "Technical Knowledge",
  mixed_domain: "Mixed / Cross-Domain",
};

export const ANSWER_FRAMEWORKS = [
  "STAR",
  "STAR_L",
  "CAR",
  "PAR",
  "PREP",
  "PASR", // Problem -> Analysis -> Solution -> Result
  "SDO",  // Situation -> Decision -> Outcome
  "CEE",  // Claim -> Evidence -> Explanation
  "TET",  // Technical Explanation -> Example -> Trade-offs
  "CAR_RISKS", // Case Analysis -> Recommendation -> Risks & Mitigations
  "DOMAIN_REASONING", // Domain-specific professional reasoning
] as const;

export type AnswerFramework = (typeof ANSWER_FRAMEWORKS)[number];

export const RESPONSE_MODES = [
  "concise",
  "conversational",
  "detailed",
  "professional",
  "technical",
  "executive",
  "beginner_friendly",
  "star_based",
  "analytical",
  "role_specific",
] as const;

export type ResponseMode = (typeof RESPONSE_MODES)[number];

export const QUESTION_ARCHETYPES = [
  "tell_me_about_yourself",
  "why_hire_you",
  "why_company",
  "why_role",
  "strengths_weaknesses",
  "conflict_resolution",
  "leadership_teamwork",
  "problem_solving",
  "technical_explanation",
  "case_study",
  "scenario_question",
  "numerical_analytical",
  "ethical_dilemma",
  "role_knowledge",
  "career_motivation",
  "salary_expectations",
  "cv_experience",
  "project_achievement",
  "general",
] as const;

export type QuestionArchetype = (typeof QUESTION_ARCHETYPES)[number];

export function isInterviewDomain(value: unknown): value is InterviewDomain {
  return typeof value === "string" && (INTERVIEW_DOMAINS as readonly string[]).includes(value);
}
