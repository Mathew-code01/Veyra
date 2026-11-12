// ============================================================================
// FILE: shared/types/preparation.ts
// PURPOSE:
// Typed contracts for role and company preparation intelligence (Phase 17).
//
// These describe grounded preparation outputs derived from a candidate profile,
// imported evidence, a job description and (optionally) company research. They
// are transport/domain contracts only and perform no AI generation, storage or
// network access.
// ============================================================================

export type Seniority = "entry" | "mid" | "senior" | "lead" | "executive";

export type RequirementCategory =
  | "required"
  | "preferred"
  | "qualification"
  | "responsibility";

export type MatchType = "strong" | "partial" | "missing";

export type PreparationActivityType =
  | "practice_question"
  | "concept_study"
  | "example_review"
  | "mock_interview"
  | "company_research";

export type ResearchSourceType =
  | "user_provided"
  | "public"
  | "company_website";

// ============================================================================
// JOB DESCRIPTION ANALYSIS
// ============================================================================

export interface RoleRequirement {
  readonly id: string;
  readonly category: RequirementCategory;
  readonly title: string;
  readonly description: string;
  readonly matched: boolean;
  readonly confidence: number; // 0 - 1
  readonly supportingEvidenceIds: readonly string[];
}

export interface JobDescriptionAnalysis {
  readonly id: string;
  readonly jobTitle: string;
  readonly company?: string;
  readonly seniority: Seniority | undefined;
  readonly domain: string;
  readonly domainConfidence: number; // 0 - 1
  readonly requiredSkills: readonly string[];
  readonly preferredSkills: readonly string[];
  readonly responsibilities: readonly string[];
  readonly qualifications: readonly string[];
  readonly requirements: readonly RoleRequirement[];
  readonly likelyTopics: readonly string[];
  readonly sourceExcerptIds: readonly string[]; // provenance into the JD text
  readonly analyzedAt: string;
}

// ============================================================================
// GAP ANALYSIS
// ============================================================================

export interface CandidateRoleGap {
  readonly requirementId: string;
  readonly requirementTitle: string;
  readonly matchType: MatchType;
  readonly confidence: number; // 0 - 1
  readonly supportingEvidenceIds: readonly string[];
  readonly transferableExperienceIds: readonly string[];
  readonly explanation: string;
  readonly practiceRecommended: boolean;
}

export interface GapAnalysis {
  readonly jobDescriptionId: string;
  readonly candidateId: string;
  readonly overallFitScore: number; // 0 - 100
  readonly strongMatches: readonly CandidateRoleGap[];
  readonly partialMatches: readonly CandidateRoleGap[];
  readonly missingEvidence: readonly CandidateRoleGap[];
  readonly skillsToPractice: readonly string[];
}

// ============================================================================
// COMPANY RESEARCH (user-provided / public sources only; no scraping)
// ============================================================================

export interface CompanyResearchSource {
  readonly id: string;
  readonly type: ResearchSourceType;
  readonly title: string;
  readonly url?: string;
  readonly retrievedAt: string;
  readonly contentSummary: string;
}

export interface CompanyResearch {
  readonly companyName: string;
  readonly sources: readonly CompanyResearchSource[];
  readonly industry?: string;
  readonly businessModel?: string;
  readonly recentDevelopments: readonly string[];
  readonly valuesAndCulture: readonly string[];
  readonly roleRelevance: readonly string[];
  readonly candidateQuestions: readonly string[];
  readonly provenanceNote: string;
}

// ============================================================================
// PREPARATION PLAN
// ============================================================================

export interface PreparationActivity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: PreparationActivityType;
  readonly relatedRequirementId?: string;
  readonly relatedCompetency?: string;
  readonly exampleQuestion?: string;
  readonly targetImprovement: string;
  readonly measurableGoal: string;
}

export interface MockInterviewConfig {
  readonly domain: string;
  readonly interviewType: string;
  readonly questionCount: number;
}

export interface PreparationPlan {
  readonly id: string;
  readonly jobDescriptionId: string;
  readonly candidateId: string;
  readonly roleTitle: string;
  readonly domain: string;
  readonly overallFitScore: number; // 0 - 100
  readonly priorityGaps: readonly string[];
  readonly activities: readonly PreparationActivity[];
  readonly companyResearch?: CompanyResearch;
  readonly studyPriorities: readonly string[];
  readonly questionsToAskEmployer: readonly string[];
  readonly mockInterviewConfig: MockInterviewConfig;
  readonly generatedAt: string;
}

// ============================================================================
// INPUTS
// ============================================================================

export interface JobDescriptionAnalysisInput {
  readonly jobDescriptionText: string;
  readonly jobTitle?: string;
  readonly company?: string;
}

export interface GapAnalysisInput {
  readonly candidateId: string;
  readonly jobDescriptionAnalysis: JobDescriptionAnalysis;
  readonly candidateEvidence: readonly {
    readonly id: string;
    readonly text: string;
    readonly source: string;
    readonly verified?: boolean;
  }[];
}

export interface PreparationPlanInput {
  readonly candidateId: string;
  readonly jobDescriptionAnalysis: JobDescriptionAnalysis;
  readonly gapAnalysis: GapAnalysis;
  readonly companyResearch?: CompanyResearch;
  readonly domainIntelligence?: {
    readonly domain: string;
    readonly competencies: readonly string[];
  };
}
