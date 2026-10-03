// ============================================================================
// FILE: core/context/retrieval/ContextRanker.ts
//
// PURPOSE:
// Generic post-retrieval ranking.
//
// IMPORTANT:
// This class must NOT encode candidate/interview policy.
//
// Therefore it does not assume that:
// - stories are more important
// - resumes are more important
// - candidate evidence is more important
// - interview answers are more important
//
// Source-specific ranking policy can be injected by higher-level orchestration.
// ============================================================================

import type {
  RankedContext,
  RetrievedContext,
} from "../contracts/ContextQuery";

export interface ContextRankingPolicy {
  /**
   * Optional multiplier by source type.
   *
   * Unspecified sources use 1.
   */
  readonly sourceWeights?: Readonly<Record<string, number>>;

  /**
   * Optional multiplier by content type.
   */
  readonly contentWeights?: Readonly<Record<string, number>>;

  /**
   * Optional metadata key containing a caller-provided priority.
   */
  readonly priorityMetadataKey?: string;
}

export class ContextRanker {
  private readonly policy: ContextRankingPolicy;

  public constructor(policy: ContextRankingPolicy = {}) {
    this.policy = {
      sourceWeights: policy.sourceWeights ?? {},

      contentWeights: policy.contentWeights ?? {},

      priorityMetadataKey: policy.priorityMetadataKey,
    };
  }

  public rank(contexts: readonly RetrievedContext[]): readonly RankedContext[] {
    if (!Array.isArray(contexts)) {
      throw new TypeError("Contexts must be an array.");
    }

    const ranked = contexts.map((context) => this.rankOne(context));

    ranked.sort((left, right) => right.rankScore - left.rankScore);

    return ranked;
  }

  private rankOne(context: RetrievedContext): RankedContext {
    const sourceWeight = this.policy.sourceWeights?.[context.source.type] ?? 1;

    const contentWeight =
      this.policy.contentWeights?.[context.contentType] ?? 1;

    let priorityWeight = 1;

    const reasons: string[] = [];

    if (sourceWeight !== 1) {
      priorityWeight *= sourceWeight;

      reasons.push(`source-weight:${sourceWeight}`);
    }

    if (contentWeight !== 1) {
      priorityWeight *= contentWeight;

      reasons.push(`content-weight:${contentWeight}`);
    }

    if (this.policy.priorityMetadataKey) {
      const raw = context.metadata[this.policy.priorityMetadataKey];

      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
        priorityWeight *= raw;

        reasons.push(`metadata-priority:${raw}`);
      }
    }

    const rankScore = context.score * priorityWeight;

    if (reasons.length === 0) {
      reasons.push("semantic-similarity");
    }

    return {
      ...context,

      rankScore,

      reasons,
    };
  }
}
