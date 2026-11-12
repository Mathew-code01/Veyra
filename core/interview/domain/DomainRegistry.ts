// ============================================================================
// FILE: core/interview/domain/DomainRegistry.ts
// PURPOSE:
// Extensible domain registry (Phase 16).
//
// Holds configurable DomainDefinition records for every professional domain
// Veyra supports. Domains are registered once and looked up by the domain-aware
// planner and evaluator so the same canonical interview runtime produces
// domain-appropriate question analysis, answer planning and evaluation.
//
// ARCHITECTURAL RULE:
// The registry is configuration, not a second engine. New domains can be
// registered without touching the planner or evaluator.
// ============================================================================

import type {
  AnswerFramework,
  InterviewDomain,
  QuestionArchetype,
} from "../../../shared/constants/interviewDomains";
import { INTERVIEW_DOMAINS, INTERVIEW_DOMAIN_LABELS } from "../../../shared/constants/interviewDomains";

import type {
  CompetencyDefinition,
  DomainAnswerEvaluation,
  DomainAnswerPlan,
  DomainDefinition,
} from "./DomainDefinition";

// ============================================================================
// REGISTRY
// ============================================================================

export class DomainRegistry {
  private readonly domains = new Map<InterviewDomain, DomainDefinition>();

  public register(definition: DomainDefinition): void {
    this.domains.set(definition.id, definition);
  }

  public get(domainId: InterviewDomain): DomainDefinition | undefined {
    return this.domains.get(domainId);
  }

  public getAll(): readonly DomainDefinition[] {
    return [...this.domains.values()];
  }

  public has(domainId: InterviewDomain): boolean {
    return this.domains.has(domainId);
  }

  public defaultDomain(): InterviewDomain {
    return "general_employment";
  }
}

// ============================================================================
// DEFAULT DOMAIN DEFINITIONS
// ============================================================================

function competency(id: string, name: string, description: string): CompetencyDefinition {
  return { id, name, description };
}

function domain(
  id: InterviewDomain,
  name: string,
  options: {
    readonly competencies: readonly CompetencyDefinition[];
    readonly questionArchetypes: readonly QuestionArchetype[];
    readonly answerFrameworks: readonly AnswerFramework[];
    readonly evaluationCriteria: readonly string[];
    readonly typicalTalkingPoints: readonly string[];
  },
): DomainDefinition {
  return {
    id,
    name,
    ...options,
  };
}

export function buildDefaultRegistry(): DomainRegistry {
  const registry = new DomainRegistry();

  registry.register(
    domain("software_engineering", "Software Engineering & IT", {
      competencies: [
        competency("coding", "Coding & Implementation", "Writing clean, correct, maintainable code."),
        competency("system_design", "System Design", "Designing scalable, reliable architectures."),
        competency("debugging", "Debugging & Troubleshooting", "Identifying and resolving defects."),
        competency("testing", "Testing & Quality", "Ensuring correctness through tests."),
      ],
      questionArchetypes: ["technical_explanation", "problem_solving", "system_design", "code_review", "general"],
      answerFrameworks: ["TET", "STAR", "PAR", "CAR"],
      evaluationCriteria: [
        "technical_accuracy",
        "solution_approach",
        "trade_off_awareness",
        "code_quality",
        "communication",
      ],
      typicalTalkingPoints: [
        "State the problem and constraints first.",
        "Describe your approach and reasoning.",
        "Discuss trade-offs you considered.",
        "Share a concrete example or outcome.",
      ],
    }),
  );

  registry.register(
    domain("data_and_analytics", "Data Science, Analytics & AI", {
      competencies: [
        competency("statistics", "Statistics & Experimentation", "Designing tests and interpreting results."),
        competency("modeling", "Modeling & Algorithms", "Building predictive and analytical models."),
        competency("data_quality", "Data Quality & Pipeline", "Ensuring clean, reliable data flow."),
        competency("communication", "Communicating Insights", "Translating findings for stakeholders."),
      ],
      questionArchetypes: ["numerical_analytical", "case_study", "technical_explanation", "general"],
      answerFrameworks: ["CAR", "STAR", "PAR", "PREP"],
      evaluationCriteria: [
        "statistical_rigor",
        "methodology",
        "data_quality",
        "insight_clarity",
        "business_impact",
      ],
      typicalTalkingPoints: [
        "State the hypothesis and metric you moved.",
        "Describe your methodology and data.",
        "Address validity and confounding factors.",
        "Tie the result to a business outcome.",
      ],
    }),
  );

  registry.register(
    domain("finance_and_accounting", "Finance, Accounting & Economics", {
      competencies: [
        competency("valuation", "Valuation & Financial Modeling", "DCF, comps, and deal analysis."),
        competency("reporting", "Financial Reporting", "GAAP/IFRS statements and disclosures."),
        competency("analysis", "Financial Analysis", "Variance, forecasting, and business cases."),
        competency("risk", "Risk & Controls", "Internal controls and audit awareness."),
      ],
      questionArchetypes: ["numerical_analytical", "case_study", "technical_explanation", "general"],
      answerFrameworks: ["CAR", "STAR", "CEE", "PREP"],
      evaluationCriteria: [
        "technical_accuracy",
        "methodology",
        "assumptions",
        "recommendation_clarity",
        "communication",
      ],
      typicalTalkingPoints: [
        "State assumptions and inputs up front.",
        "Walk through the calculation or model.",
        "Discuss risks and sensitivities.",
        "Give a clear recommendation.",
      ],
    }),
  );

  registry.register(
    domain("business_and_management", "Business Management & Administration", {
      competencies: [
        competency("strategy", "Strategy & Planning", "Setting direction and priorities."),
        competency("stakeholders", "Stakeholder Management", "Aligning cross-functional partners."),
        competency("operations", "Operations & Execution", "Driving day-to-day results."),
        competency("decision_making", "Decision Making", "Making sound judgments under uncertainty."),
      ],
      questionArchetypes: ["case_study", "scenario_question", "behavioral_and_competency", "general"],
      answerFrameworks: ["STAR", "PREP", "SDO", "PAR"],
      evaluationCriteria: [
        "strategic_thinking",
        "stakeholder_awareness",
        "execution",
        "decision_quality",
        "communication",
      ],
      typicalTalkingPoints: [
        "Frame the business problem and objective.",
        "Describe stakeholders and their interests.",
        "Explain the action you took and why.",
        "Share the measurable outcome.",
      ],
    }),
  );

  registry.register(
    domain("healthcare_and_clinical", "Healthcare & Clinical Roles", {
      competencies: [
        competency("patient_care", "Patient Care & Safety", "Delivering safe, compassionate care."),
        competency("protocols", "Clinical Protocols", "Following evidence-based guidelines."),
        competency("collaboration", "Interdisciplinary Collaboration", "Working with care teams."),
        competency("documentation", "Clinical Documentation", "Accurate records and compliance."),
      ],
      questionArchetypes: ["scenario_question", "behavioral_and_competency", "case_study", "general"],
      answerFrameworks: ["STAR", "CAR", "CEE", "SDO"],
      evaluationCriteria: [
        "patient_safety",
        "protocol_adherence",
        "clinical_judgment",
        "communication",
        "documentation",
      ],
      typicalTalkingPoints: [
        "Describe the clinical situation and priority.",
        "Reference the protocol or standard of care.",
        "Explain your clinical reasoning.",
        "Describe the patient outcome.",
      ],
    }),
  );

  registry.register(
    domain("education_and_academic", "Education & Teaching", {
      competencies: [
        competency("instruction", "Instructional Design", "Planning and delivering lessons."),
        competency("assessment", "Assessment & Feedback", "Evaluating learner progress."),
        competency("classroom_management", "Classroom Management", "Maintaining a productive environment."),
        competency("differentiation", "Differentiated Instruction", "Meeting diverse learner needs."),
      ],
      questionArchetypes: ["scenario_question", "behavioral_and_competency", "case_study", "general"],
      answerFrameworks: ["STAR", "CAR", "PREP", "PAR"],
      evaluationCriteria: [
        "instructional_quality",
        "assessment_alignment",
        "classroom_management",
        "differentiation",
        "communication",
      ],
      typicalTalkingPoints: [
        "State the learning objective.",
        "Describe your instructional approach.",
        "Explain how you assessed understanding.",
        "Share student outcomes.",
      ],
    }),
  );

  registry.register(
    domain("sales_and_marketing", "Sales, Marketing & Customer Success", {
      competencies: [
        competency("prospecting", "Prospecting & Pipeline", "Generating and qualifying leads."),
        competency("positioning", "Positioning & Messaging", "Communicating value to buyers."),
        competency("closing", "Closing & Negotiation", "Driving deals to completion."),
        competency("metrics", "Go-to-Market Metrics", "CAC, LTV, conversion, churn."),
      ],
      questionArchetypes: ["case_study", "scenario_question", "role_knowledge", "general"],
      answerFrameworks: ["STAR", "CAR", "PREP", "PAR"],
      evaluationCriteria: [
        "customer_centricity",
        "results_orientation",
        "messaging_clarity",
        "objection_handling",
        "metrics_driven",
      ],
      typicalTalkingPoints: [
        "Identify the customer need or pain point.",
        "Describe your outreach and messaging.",
        "Share the outcome and metrics.",
        "Discuss what you learned.",
      ],
    }),
  );

  registry.register(
    domain("human_resources", "Human Resources & Talent Acquisition", {
      competencies: [
        competency("recruiting", "Recruiting & Sourcing", "Attracting and selecting talent."),
        competency("employee_relations", "Employee Relations", "Managing workplace issues."),
        competency("compliance", "HR Compliance", "Labor law and policy adherence."),
        competency("development", "Learning & Development", "Growing employee capability."),
      ],
      questionArchetypes: ["behavioral_and_competency", "scenario_question", "case_study", "general"],
      answerFrameworks: ["STAR", "CAR", "PREP", "SDO"],
      evaluationCriteria: [
        "fairness",
        "policy_adherence",
        "people_judgment",
        "conflict_resolution",
        "communication",
      ],
      typicalTalkingPoints: [
        "Describe the situation and employees involved.",
        "Reference policy or best practice.",
        "Explain your actions and reasoning.",
        "Share the resolution and follow-up.",
      ],
    }),
  );

  registry.register(
    domain("leadership_and_management", "Leadership & People Management", {
      competencies: [
        competency("vision", "Vision & Strategy", "Setting a compelling direction."),
        competency("coaching", "Coaching & Development", "Developing direct reports."),
        competency("conflict", "Conflict Resolution", "Resolving team disagreements."),
        competency("decision_making", "Management Decision Making", "Calling tough calls."),
      ],
      questionArchetypes: ["leadership_teamwork", "scenario_question", "behavioral_and_competency", "general"],
      answerFrameworks: ["STAR", "CAR", "SDO", "PREP"],
      evaluationCriteria: [
        "leadership_presence",
        "people_development",
        "decision_quality",
        "conflict_handling",
        "communication",
      ],
      typicalTalkingPoints: [
        "Set the context and your role.",
        "Describe your leadership approach.",
        "Explain how you developed others.",
        "Share team results.",
      ],
    }),
  );

  registry.register(
    domain("consulting_and_strategy", "Consulting & Strategy", {
      competencies: [
        competency("structuring", "Problem Structuring", "Breaking down ambiguous problems."),
        competency("analysis", "Analytical Rigor", "Data-driven hypothesis testing."),
        competency("communication", "Executive Communication", "Presenting to senior stakeholders."),
        competency("implementation", "Implementation", "Turning recommendations into action."),
      ],
      questionArchetypes: ["case_study", "scenario_question", "problem_solving", "general"],
      answerFrameworks: ["CAR_RISKS", "STAR", "PREP", "CEE"],
      evaluationCriteria: [
        "framework_use",
        "analytical_rigor",
        "insight_clarity",
        "recommendation_actionability",
        "communication",
      ],
      typicalTalkingPoints: [
        "Structure the problem with a clear framework.",
        "Walk through your analysis and hypotheses.",
        "State your recommendation with rationale.",
        "Address risks and next steps.",
      ],
    }),
  );

  registry.register(
    domain("customer_service", "Customer Service & Client Support", {
      competencies: [
        competency("empathy", "Empathy & Patience", "Understanding customer emotions."),
        competency("resolution", "Issue Resolution", "Solving customer problems."),
        competency("communication", "Clear Communication", "Explaining solutions simply."),
        competency("de_escalation", "De-escalation", "Calming upset customers."),
      ],
      questionArchetypes: ["scenario_question", "behavioral_and_competency", "general"],
      answerFrameworks: ["STAR", "CAR", "SDO", "PAR"],
      evaluationCriteria: [
        "customer_empathy",
        "issue_resolution",
        "communication_clarity",
        "de_escalation",
        "follow_up",
      ],
      typicalTalkingPoints: [
        "Acknowledge the customer's concern.",
        "Describe what you did to help.",
        "Explain how you communicated.",
        "Share the resolution and satisfaction.",
      ],
    }),
  );

  registry.register(
    domain("general_employment", "General Employment & Entry-Level", {
      competencies: [
        competency("communication", "Communication", "Expressing ideas clearly."),
        competency("reliability", "Reliability & Work Ethic", "Being dependable and punctual."),
        competency("teamwork", "Teamwork", "Collaborating effectively."),
        competency("adaptability", "Adaptability", "Learning quickly and adapting."),
      ],
      questionArchetypes: ["tell_me_about_yourself", "strengths_weaknesses", "why_role", "general"],
      answerFrameworks: ["STAR", "PREP", "CAR", "PAR"],
      evaluationCriteria: [
        "clarity",
        "relevance",
        "authenticity",
        "structure",
        "communication",
      ],
      typicalTalkingPoints: [
        "Give a brief, relevant introduction.",
        "Connect your experience to the role.",
        "Share a concrete example.",
        "Conclude with your interest.",
      ],
    }),
  );

  // Register remaining domains with lightweight, generic definitions.
  const remaining: InterviewDomain[] = [
    "economics",
    "technical",
    "operations_and_logistics",
    "engineering_and_trades",
    "consulting_and_strategy",
    "behavioral_and_competency",
    "situational",
    "academic_and_research",
    "technical",
    "mixed_domain",
  ];
  for (const id of remaining) {
    if (registry.has(id)) continue;
    registry.register(
      domain(id, INTERVIEW_DOMAIN_LABELS[id], {
        competencies: [
          competency("domain_knowledge", "Domain Knowledge", "Understanding of the field."),
          competency("problem_solving", "Problem Solving", "Applying knowledge to challenges."),
          competency("communication", "Communication", "Explaining ideas clearly."),
        ],
        questionArchetypes: ["technical_explanation", "scenario_question", "general"],
        answerFrameworks: ["STAR", "CAR", "PREP", "PAR"],
        evaluationCriteria: ["domain_knowledge", "problem_solving", "communication", "evidence"],
        typicalTalkingPoints: [
          "State the situation and your role.",
          "Describe your approach.",
          "Share the outcome and lesson.",
        ],
      }),
    );
  }

  return registry;
}
