// ============================================================================
// FILE: core/candidate/contracts/CandidateEvidence.ts
// PURPOSE:
// Canonical representation of evidence about a candidate.
//
// IMPORTANT:
// Evidence is not automatically "truth" merely because it exists.
// `verified` and `confidence` explicitly represent provenance quality.
// ============================================================================

import type { CandidateId } from "./CandidateTypes";

export type CandidateEvidenceType =
  | "resume"
  | "experience"
  | "project"
  | "skill"
  | "story"
  | "education"
  | "certification";

export interface CandidateEvidence {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly type: CandidateEvidenceType;

  readonly text: string;

  readonly sourceId?: string;
  readonly sourceName?: string;

  readonly verified: boolean;
  readonly confidence: number;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EvidenceValidationResult {
  readonly valid: boolean;
  readonly confidence: number;
  readonly reasons: readonly string[];
}
