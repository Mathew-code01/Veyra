// core/candidate/EvidenceValidator.ts

export type EvidenceType =
  | "resume"
  | "experience"
  | "project"
  | "skill"
  | "story"
  | "education"
  | "certification";

export interface CandidateEvidence {
  readonly id: string;
  readonly candidateId: string;
  readonly type: EvidenceType;
  readonly text: string;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly verified: boolean;
  readonly confidence: number;
}

export interface EvidenceValidationResult {
  readonly valid: boolean;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export class EvidenceValidator {
  public validate(evidence: CandidateEvidence): EvidenceValidationResult {
    const reasons: string[] = [];

    if (!evidence.id.trim()) {
      reasons.push("Evidence id is missing.");
    }

    if (!evidence.candidateId.trim()) {
      reasons.push("Candidate id is missing.");
    }

    if (!evidence.text.trim()) {
      reasons.push("Evidence text is empty.");
    }

    if (
      !Number.isFinite(evidence.confidence) ||
      evidence.confidence < 0 ||
      evidence.confidence > 1
    ) {
      reasons.push("Evidence confidence must be between 0 and 1.");
    }

    const valid = reasons.length === 0;

    return {
      valid,
      confidence: valid
        ? evidence.verified
          ? Math.max(evidence.confidence, 0.9)
          : evidence.confidence
        : 0,
      reasons,
    };
  }

  public validateCollection(
    evidence: readonly CandidateEvidence[],
  ): EvidenceValidationResult {
    if (evidence.length === 0) {
      return {
        valid: false,
        confidence: 0,
        reasons: ["No candidate evidence was supplied."],
      };
    }

    const results = evidence.map((item) => this.validate(item));

    const valid = results.every((result) => result.valid);

    const confidence =
      results.reduce((sum, result) => sum + result.confidence, 0) /
      results.length;

    return {
      valid,
      confidence,
      reasons: results.flatMap((result) => result.reasons),
    };
  }
}