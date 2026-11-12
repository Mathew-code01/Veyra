// ============================================================================
// FILE: core/interview/domain/DomainAwareEvaluator.ts
// PURPOSE:
// Domain-aware answer evaluation (Phase 16).
//
// Weights evaluation dimensions according to a domain's evaluation criteria so
// the same canonical evaluation engine produces domain-appropriate results.
//
// ARCHITECTURAL RULE:
// Delegates to the existing AnswerEvaluationEngine; only dimension weighting
// and domain framing are domain-specific.
// ============================================================================

import type { AnswerEvaluation } from "../../../shared/types/interviews";
import type { QuestionUnderstanding } from "../../../shared/types/interviews";
import type { DomainAnswerEvaluation } from "./DomainDefinition";
import type { DomainRegistry } from "./DomainRegistry";

import { AnswerEvaluationEngine } from "../evaluation/AnswerEvaluationEngine";

// ============================================================================
// EVALUATOR
// ============================================================================

export interface DomainAwareEvaluateInput {
  readonly answerText: string;
  readonly questionUnderstanding: QuestionUnderstanding;
  readonly domainId: string;
  readonly targetRole?: string;
}

export class DomainAwareEvaluator {
  private readonly registry: DomainRegistry;
  private readonly evaluator: AnswerEvaluationEngine;

  public constructor(registry: DomainRegistry, evaluator: AnswerEvaluationEngine) {
    this.registry = registry;
    this.evaluator = evaluator;
  }

  public evaluate(input: DomainAwareEvaluateInput): DomainAnswerEvaluation {
    const domain = this.registry.get(input.domainId as any);
    const criteria = domain?.evaluationCriteria ?? [];

    const base = this.evaluator.evaluate({
      answerText: input.answerText,
      questionUnderstanding: input.questionUnderstanding,
      domain: input.domainId as any,
      targetRole: input.targetRole,
    });

    const dimensionOrder = criteria.length
      ? criteria
      : [
          "relevance",
          "completeness",
          "clarity",
          "structure",
          "accuracy",
          "evidenceGrounding",
          "professionalism",
          "communication",
          "reasoningConfidence",
          "conciseness",
          "roleAlignment",
        ];

    const baseDimensions = base.dimensions ?? {};
    const dimensions = dimensionOrder.map((dimension) => {
      const found = baseDimensions[dimension];
      const score = found?.score ?? 0;
      const weight = criteria.indexOf(dimension) >= 0 ? 1.2 : 1.0;
      return Object.freeze({
        dimension,
        score,
        weight,
        feedback: found?.feedback ?? "Not explicitly assessed.",
        criteria: domain?.evaluationCriteria ?? [],
      });
    });

    const overallScore =
      dimensions.length > 0
        ? Math.round(
            dimensions.reduce((s, d) => s + d.score * d.weight, 0) /
              dimensions.reduce((s, d) => s + d.weight, 0),
          )
        : base.overallScore;

    return Object.freeze({
      domainId: input.domainId as any,
      overallScore,
      dimensions: Object.freeze(dimensions),
      demonstratedCompetencies: Object.freeze(base.demonstratedCompetencies),
      strengths: Object.freeze(base.strengths),
      gaps: Object.freeze(base.gaps),
      ambiguities: Object.freeze(base.ambiguities),
      actionableImprovements: Object.freeze(base.actionableImprovements),
      basis: domain ? "domain_aware" : "generic",
    });
  }

  public getDomain(domainId: string): DomainDefinition | undefined {
    return this.registry.get(domainId as any);
  }
}
