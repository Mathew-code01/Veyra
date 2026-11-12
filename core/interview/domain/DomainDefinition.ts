// ============================================================================
// FILE: core/interview/domain/DomainDefinition.ts
// PURPOSE:
// Extensible professional-domain definitions (Phase 16).
//
// These are configuration/data contracts only. They describe how Veyra adapts
// interview intelligence to a specific professional domain without building a
// separate engine per profession.
//
// ARCHITECTURAL RULE:
// One canonical interview runtime (UnifiedInterviewRuntime) is used for all
// domains. Domain definitions configure *how* that runtime plans and
// evaluates answers for each profession; they do not duplicate engines.
// ============================================================================

import type {
  AnswerFramework,
  InterviewDomain,
  QuestionArchetype,
} from "../../../shared/constants/interviewDomains";

// ============================================================================
// TYPES
// ============================================================================

export interface CompetencyDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface DomainDefinition {
  readonly id: InterviewDomain;
  readonly name: string;
  readonly competencies: readonly CompetencyDefinition[];
  readonly questionArchetypes: readonly QuestionArchetype[];
  readonly answerFrameworks: readonly AnswerFramework[];
  readonly evaluationCriteria: readonly string[];
  readonly typicalTalkingPoints: readonly string[];
}

export interface DomainAnswerPlan {
  readonly domainId: InterviewDomain;
  readonly framework: AnswerFramework;
  readonly headline: string;
  readonly sections: readonly { readonly title: string; readonly points: readonly string[] }[];
  readonly talkingPoints: readonly string[];
  readonly cautions: readonly string[];
  readonly recommendedEvidenceIds: readonly string[];
  readonly structure: readonly string[];
}

export interface DomainAnswerEvaluation {
  readonly domainId: InterviewDomain;
  readonly overallScore: number;
  readonly dimensions: readonly {
    readonly dimension: string;
    readonly score: number;
    readonly weight: number;
    readonly feedback: string;
    readonly criteria: readonly string[];
  }[];
  readonly demonstratedCompetencies: readonly string[];
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly ambiguities: readonly string[];
  readonly actionableImprovements: readonly string[];
  readonly basis: "domain_aware" | "generic";
}
