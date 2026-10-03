// core/context/ContextRanker.ts

import type { RetrievedContext } from "./Retriever";

export interface RankedContext extends RetrievedContext {
  readonly rankScore: number;
  readonly relevanceReason: string;
}

export interface ContextRankerOptions {
  readonly sourceWeights?: Readonly<Record<string, number>>;
}

const DEFAULT_SOURCE_WEIGHTS: Record<string, number> = {
  story: 1.15,
  experience: 1.12,
  project: 1.1,
  skills: 1.05,
  resume: 1,
  "job-description": 0.98,
  "company-research": 0.9,
  generic: 0.85,
};

export class ContextRanker {
  private readonly sourceWeights: Readonly<Record<string, number>>;

  public constructor(options: ContextRankerOptions = {}) {
    this.sourceWeights = {
      ...DEFAULT_SOURCE_WEIGHTS,
      ...(options.sourceWeights ?? {}),
    };
  }

  public rank(contexts: readonly RetrievedContext[]): readonly RankedContext[] {
    const ranked = contexts.map((context) => {
      const type = String(context.metadata.type ?? "generic");

      const sourceWeight = this.sourceWeights[type] ?? 1;

      const evidenceWeight = this.getEvidenceWeight(context.metadata);

      const rankScore = context.score * sourceWeight * evidenceWeight;

      return {
        ...context,
        rankScore,
        relevanceReason: this.getReason(type, sourceWeight, evidenceWeight),
      };
    });

    return [...ranked].sort((a, b) => b.rankScore - a.rankScore);
  }

  private getEvidenceWeight(
    metadata: Readonly<Record<string, unknown>>,
  ): number {
    const verified = metadata.verified === true;

    const confidence =
      typeof metadata.confidence === "number" ? metadata.confidence : 1;

    const boundedConfidence = Math.min(1, Math.max(0, confidence));

    let weight = 0.85 + boundedConfidence * 0.15;

    if (verified) {
      weight += 0.08;
    }

    return weight;
  }

  private getReason(
    type: string,
    sourceWeight: number,
    evidenceWeight: number,
  ): string {
    if (type === "story") {
      return "STAR story evidence receives high priority.";
    }

    if (type === "experience") {
      return "Professional experience is prioritized as direct candidate evidence.";
    }

    if (type === "project") {
      return "Project evidence is prioritized for technical and project-specific questions.";
    }

    if (sourceWeight > 1 && evidenceWeight > 1) {
      return "High-confidence candidate evidence.";
    }

    return "Semantically relevant context.";
  }
}