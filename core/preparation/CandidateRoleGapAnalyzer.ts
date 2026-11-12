// ============================================================================
// FILE: core/preparation/CandidateRoleGapAnalyzer.ts
// PURPOSE:
// Candidate-role gap analysis (Phase 17).
//
// Compares job description requirements against verified candidate evidence
// and produces a grounded gap analysis: strong matches, partial matches and
// missing evidence, each with supporting evidence IDs and confidence.
//
// ARCHITECTURAL RULE:
// Deterministic keyword/evidence matching. No AI provider. Never invents
// candidate experience—only evidence that exists in the candidate profile is
// ever treated as a match.
// ============================================================================

import type {
  CandidateRoleGap,
  GapAnalysis,
  JobDescriptionAnalysis,
} from "../../../shared/types/preparation";

export interface CandidateEvidenceInput {
  readonly id: string;
  readonly text: string;
  readonly source: string;
  readonly verified?: boolean;
}

export interface GapAnalysisInput {
  readonly candidateId: string;
  readonly jobDescriptionAnalysis: JobDescriptionAnalysis;
  readonly candidateEvidence: readonly CandidateEvidenceInput[];
}

export class CandidateRoleGapAnalyzer {
  public analyze(input: GapAnalysisInput): GapAnalysis {
    const { candidateEvidence, jobDescriptionAnalysis } = input;
    const evidenceByKeyword = this.indexEvidence(candidateEvidence);

    const strongMatches: CandidateRoleGap[] = [];
    const partialMatches: CandidateRoleGap[] = [];
    const missingEvidence: CandidateRoleGap[] = [];

    for (const requirement of jobDescriptionAnalysis.requirements) {
      const match = this.matchRequirement(requirement, evidenceByKeyword);
      if (match.matchType === "strong") {
        strongMatches.push(match);
      } else if (match.matchType === "partial") {
        partialMatches.push(match);
      } else {
        missingEvidence.push(match);
      }
    }

    const skillsToPractice = [
      ...new Set(
        missingEvidence
          .map((m) => m.requirementTitle)
          .concat(
            partialMatches.map((m) => m.requirementTitle),
          ),
      ),
    ];

    const total = jobDescriptionAnalysis.requirements.length;
    const scored =
      strongMatches.length * 2 + partialMatches.length * 1;
    const max = total * 2;
    const overallFitScore = total === 0 ? 100 : Math.round((scored / max) * 100);

    return Object.freeze({
      jobDescriptionId: jobDescriptionAnalysis.id,
      candidateId: input.candidateId,
      overallFitScore,
      strongMatches: Object.freeze(strongMatches),
      partialMatches: Object.freeze(partialMatches),
      missingEvidence: Object.freeze(missingEvidence),
      skillsToPractice: Object.freeze(skillsToPractice),
    });
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private indexEvidence(
    evidence: readonly CandidateEvidenceInput[],
  ): Map<string, readonly CandidateEvidenceInput[]> {
    const byKeyword = new Map<string, CandidateEvidenceInput[]>();
    for (const e of evidence) {
      const words = e.text.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      for (const w of words) {
        const arr = byKeyword.get(w) ?? [];
        arr.push(e);
        byKeyword.set(w, arr);
      }
    }
    return byKeyword;
  }

  private matchRequirement(
    requirement: JobDescriptionAnalysis["requirements"][number],
    evidenceByKeyword: Map<string, readonly CandidateEvidenceInput[]>,
  ): CandidateRoleGap {
    const STOPWORDS = new Set([
      "of","or","and","the","a","an","in","for","with","to","is","on","as","by","at","from","be","are","was","were",
    ]);
    const reqWords = requirement.title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    const descriptionWords = requirement.description
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    const allReqWords = [...new Set([...reqWords, ...descriptionWords])];
    const reqWordCount = Math.max(allReqWords.length, 1);

    let matchedWordCount = 0;
    const matchedEvidence = new Set<string>();
    for (const w of allReqWords) {
      const arr = evidenceByKeyword.get(w);
      if (arr && arr.length > 0) {
        matchedWordCount += 1;
        for (const e of arr) {
          matchedEvidence.add(e.id);
        }
      }
    }
    const coverage = matchedWordCount / reqWordCount;
    const hasVerified = [...matchedEvidence].some(
      (id) => candidateEvidenceById(evidenceByKeyword, id)?.verified,
    );

    let matchType: MatchType = "missing";
    if (coverage >= 0.6 && matchedEvidence.size > 0) {
      matchType = "strong";
    } else if (coverage >= 0.25 && matchedEvidence.size > 0) {
      matchType = "partial";
    }

    const confidence = Math.min(1, coverage + (hasVerified ? 0.2 : 0));
    const supportingEvidenceIds = [...matchedEvidence];
    const transferableExperienceIds = [...matchedEvidence].filter((id) => {
      const e = candidateEvidenceById(evidenceByKeyword, id);
      return e && e.source === "candidate";
    });

    const explanation = this.buildExplanation(
      requirement,
      matchType,
      coverage,
      matchedEvidence.size,
    );

    return Object.freeze({
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      matchType,
      confidence,
      supportingEvidenceIds: Object.freeze(supportingEvidenceIds),
      transferableExperienceIds: Object.freeze(transferableExperienceIds),
      explanation,
      practiceRecommended: matchType !== "strong",
    });
  }

  private buildExplanation(
    requirement: JobDescriptionAnalysis["requirements"][number],
    matchType: MatchType,
    coverage: number,
    evidenceCount: number,
  ): string {
    if (matchType === "strong") {
      return `Strong match: ${evidenceCount} candidate evidence item(s) cover ${Math.round(coverage * 100)}% of "${requirement.title}".`;
    }
    if (matchType === "partial") {
      return `Partial match: ${evidenceCount} item(s) cover ${Math.round(coverage * 100)}% of "${requirement.title}"; consider targeted practice.`;
    }
    return `Missing: no candidate evidence found for "${requirement.title}"; recommend practice and, where possible, obtaining supporting evidence.`;
  }
}

// Helper used by matchRequirement to look up an evidence item by id.
function candidateEvidenceById(
  evidenceByKeyword: Map<string, readonly CandidateEvidenceInput[]>,
  id: string,
): CandidateEvidenceInput | undefined {
  for (const arr of evidenceByKeyword.values()) {
    const found = arr.find((e) => e.id === id);
    if (found) return found;
  }
  return undefined;
}
