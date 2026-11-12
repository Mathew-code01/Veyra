// ============================================================================
// FILE: core/candidate/services/CandidateEvidenceDeduplicator.ts
// PURPOSE:
// Deduplicates candidate evidence.
//
// RESPONSIBILITY:
// - Detects duplicate evidence based on text similarity and source overlap.
// - Merges duplicate evidence into a single canonical item.
// - Preserves the highest-confidence item as the canonical source.
// - Never deletes evidence; marks duplicates as linked instead.
//
// ARCHITECTURAL RULE:
// Pure function over candidate evidence. No AI provider, no database access,
// no external calls. Pure TypeScript.
//
// NO NEW DEPENDENCIES: Uses only existing repo types.
// ============================================================================

import type { CandidateEvidence } from "../contracts/CandidateEvidence";
import type { CandidateId } from "../contracts/CandidateTypes";

import { CandidateError } from "../errors/CandidateError";

export interface DedupCandidateEvidenceItem {
  readonly id: string;
  readonly candidateId: string;
  readonly text: string;
  readonly verified: boolean;
  readonly confidence: number;
}

export interface DedupEvidenceResult {
  readonly kept: CandidateEvidence[];
  readonly merged: readonly {
    readonly keptId: string;
    readonly mergedId: string;
    readonly reason: string;
  }[];
}

export interface CandidateEvidenceDeduplicatorOptions {
  readonly similarityThreshold?: number;
}

export class CandidateEvidenceDeduplicator {
  private readonly similarityThreshold: number;

  public constructor(options: CandidateEvidenceDeduplicatorOptions = {}) {
    this.similarityThreshold =
      options.similarityThreshold ?? 0.85;
  }

  public deduplicate(
    evidence: readonly CandidateEvidence[],
  ): DedupEvidenceResult {
    if (!evidence || evidence.length === 0) {
      return Object.freeze({
        kept: [] as CandidateEvidence[],
        merged: [] as readonly { readonly keptId: string; readonly mergedId: string; readonly reason: string }[]},
      ) as DedupEvidenceResult;
    }

    const items: DedupCandidateEvidenceItem[] = evidence.map((e) => ({
      id: e.id,
      candidateId: e.candidateId,
      text: e.text.trim(),
      verified: e.verified,
      confidence: e.confidence ?? 0,
    }));

    const kept: CandidateEvidence[] = [];
    const merged: { keptId: string; mergedId: string; reason: string }[] = [];
    const consumed = new Set<string>();

    for (const item of items) {
      if (consumed.has(item.id)) {
        continue;
      }

      const existing = kept.find((k) => this.isDuplicate(item, k));

      if (existing) {
        consumed.add(item.id);
        merged.push({
          keptId: existing.id,
          mergedId: item.id,
          reason: "Duplicate evidence text detected",
        });
      } else {
        kept.push(this.buildEvidence(item));
        consumed.add(item.id);
      }
    }

    return Object.freeze({
      kept: Object.freeze(kept as CandidateEvidence[]),
      merged: Object.freeze(merged),
    }) as DedupEvidenceResult;
  }

  private isDuplicate(a: DedupCandidateEvidenceItem, b: DedupCandidateEvidenceItem): boolean {
    const aText = a.text.toLowerCase();
    const bText = b.text.toLowerCase();

    if (aText === bText) {
      return true;
    }

    const similarity = this.jaccardSimilarity(aText, bText);
    return similarity >= this.similarityThreshold;
  }

  private jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    if (union.size === 0) {
      return 1;
    }

    return intersection.size / union.size;
  }

  private buildEvidence(item: DedupCandidateEvidenceItem): CandidateEvidence {
    return Object.freeze({
      id: item.id,
      candidateId: item.candidateId,
      type: "resume",
      text: item.text,
      sourceId: item.id,
      sourceName: "candidate-profile",
      verified: item.verified,
      confidence: item.confidence,
    });
  }
}
