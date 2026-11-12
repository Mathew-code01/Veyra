import { describe, expect, it } from "vitest";

import { QuestionUnderstandingEngine } from "../../../../core/interview/understanding/QuestionUnderstandingEngine";
import { AnswerPlanningEngine } from "../../../../core/interview/planning/AnswerPlanningEngine";
import { AnswerEvaluationEngine } from "../../../../core/interview/evaluation/AnswerEvaluationEngine";
import { DomainAwarePlanner } from "../../../../core/interview/domain/DomainAwarePlanner";
import { DomainAwareEvaluator } from "../../../../core/interview/domain/DomainAwareEvaluator";
import { buildDefaultRegistry } from "../../../../core/interview/domain/DomainRegistry";
import type { QuestionUnderstanding } from "../../../../shared/types/interviews";

function understand(question: string): QuestionUnderstanding {
  return new QuestionUnderstandingEngine().understand(question);
}

describe("Domain-aware planning and evaluation (Phase 16)", () => {
  const registry = buildDefaultRegistry();
  const planner = new DomainAwarePlanner(
    registry,
    new AnswerPlanningEngine(),
  );
  const evaluator = new DomainAwareEvaluator(
    registry,
    new AnswerEvaluationEngine(),
  );

  const domains: readonly string[] = [
    "software_engineering",
    "healthcare_and_clinical",
    "finance_and_accounting",
    "business_and_management",
  ];

  it("the same question yields domain-appropriate plans", () => {
    const understanding = understand(
      "Tell me about a time you resolved a difficult problem at work.",
    );

    const plans = domains.map((d) =>
      planner.plan({
        understanding,
        domainId: d,
        evidence: [],
      }),
    );

    // Each domain produces a plan with its preferred framework.
    const frameworks = plans.map((p) => p.framework);
    expect(new Set(frameworks).size).toBeGreaterThan(1);

    // Every plan references domain competencies/talking points.
    for (const plan of plans) {
      expect(plan.talkingPoints.length).toBeGreaterThan(0);
      expect(plan.structure.length).toBeGreaterThan(0);
    }

    // Software engineering should favor a technical framework.
    const sePlan = planner.plan({
      understanding,
      domainId: "software_engineering",
      evidence: [],
    });
    expect(["TET", "STAR", "PAR", "CAR"]).toContain(sePlan.framework);
  });

  it("the same answer yields domain-weighted evaluations", () => {
    const understanding = understand(
      "Describe a technical challenge you overcame.",
    );
    const answerText =
      "I refactored a legacy module and cut build times by 25% over two quarters.";

    const evaluations = domains.map((d) =>
      evaluator.evaluate({
        answerText,
        questionUnderstanding: understanding,
        domainId: d,
      }),
    );

    // Each evaluation is domain-tagged and has weighted dimensions.
    for (const ev of evaluations) {
      expect(ev.domainId).toBeDefined();
      expect(ev.overallScore).toBeGreaterThanOrEqual(0);
      expect(ev.overallScore).toBeLessThanOrEqual(100);
      expect(ev.dimensions.length).toBeGreaterThan(0);
      expect(
        ev.dimensions.every((d) => d.weight > 0 && d.criteria.length > 0),
      ).toBe(true);
    }

    // Domain-aware evaluations should weight domain criteria differently.
    const seEval = evaluator.evaluate({
      answerText,
      questionUnderstanding: understanding,
      domainId: "software_engineering",
    });
    const hcEval = evaluator.evaluate({
      answerText,
      questionUnderstanding: understanding,
      domainId: "healthcare_and_clinical",
    });

    const seTechWeight = seEval.dimensions.find((d) =>
      d.dimension.includes("technical"),
    )?.weight;
    const hcSafetyWeight = hcEval.dimensions.find((d) =>
      d.dimension.includes("patient_safety"),
    )?.weight;

    // Software engineering should weight technical accuracy highly;
    // healthcare should weight patient safety highly.
    expect(seTechWeight).toBeGreaterThanOrEqual(1);
    expect(hcSafetyWeight).toBeGreaterThanOrEqual(1);
  });

  it("produces generic (non-domain) evaluation for unknown domains", () => {
    const understanding = understand("Tell me about yourself.");
    const ev = evaluator.evaluate({
      answerText: "I am a reliable professional.",
      questionUnderstanding: understanding,
      domainId: "unknown_domain" as any,
    });
    expect(ev.basis).toBe("generic");
  });
});
