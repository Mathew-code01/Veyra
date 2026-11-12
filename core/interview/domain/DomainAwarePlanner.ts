// ============================================================================
// FILE: core/interview/domain/DomainAwarePlanner.ts
// PURPOSE:
// Domain-aware answer planning (Phase 16).
//
// Adapts answer planning to a professional domain by selecting the domain's
// preferred answer framework and shaping the plan around domain
// competencies and talking points.
//
// ARCHITECTURAL RULE:
// Delegates to the existing AnswerPlanningEngine for plan construction;
// only the framework selection and domain shaping are domain-specific.
// ============================================================================

import type { DomainAnswerPlan, DomainDefinition } from "./DomainDefinition";
import type { DomainRegistry } from "./DomainRegistry";

import { AnswerPlanningEngine } from "../planning/AnswerPlanningEngine";
import { QuestionUnderstandingEngine } from "../understanding/QuestionUnderstandingEngine";
import type { CandidateEvidenceItem } from "../planning/AnswerPlanningEngine";

// ============================================================================
// PLANNER
// ============================================================================

export interface DomainAwarePlanInput {
  readonly understanding: ReturnType<QuestionUnderstandingEngine["understand"]>;
  readonly domainId: string;
  readonly evidence: readonly CandidateEvidenceItem[];
  readonly responseMode?: string;
}

export class DomainAwarePlanner {
  private readonly registry: DomainRegistry;
  private readonly planner: AnswerPlanningEngine;

  public constructor(registry: DomainRegistry, planner: AnswerPlanningEngine) {
    this.registry = registry;
    this.planner = planner;
  }

  public plan(input: DomainAwarePlanInput): DomainAnswerPlan {
    const domain = this.registry.get(input.domainId as any);
    const framework = domain?.answerFrameworks[0] ?? "STAR";

    const plan = this.planner.plan(
      input.understanding,
      input.domainId as any,
      input.evidence,
      input.responseMode as any,
    );

    const domainTalkingPoints = domain?.typicalTalkingPoints ?? [];
    const talkingPoints = [
      ...new Set([
        ...plan.steps.flatMap((s) => s.keyTalkingPoints),
        ...domainTalkingPoints,
      ]),
    ];

    return Object.freeze({
      domainId: input.domainId as any,
      framework,
      headline: plan.headline,
      sections: plan.steps.map((s) => ({
        title: s.phase,
        points: s.keyTalkingPoints,
      })),
      talkingPoints: Object.freeze(talkingPoints),
      cautions: Object.freeze(plan.cautions),
      recommendedEvidenceIds: Object.freeze(plan.recommendedEvidenceIds ?? []),
      structure: Object.freeze(plan.steps.map((s) => s.phase)),
    });
  }

  public getDomain(domainId: string): DomainDefinition | undefined {
    return this.registry.get(domainId as any);
  }
}
