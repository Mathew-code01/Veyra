import { describe, expect, it } from "vitest";

import { INTERVIEW_DOMAINS } from "../../../../shared/constants/interviewDomains";
import { DomainRegistry, buildDefaultRegistry } from "../../../../core/interview/domain/DomainRegistry";

describe("DomainRegistry (Phase 16)", () => {
  const registry = buildDefaultRegistry();

  it("registers every canonical interview domain", () => {
    for (const domain of INTERVIEW_DOMAINS) {
      expect(registry.has(domain)).toBe(true);
      const def = registry.get(domain);
      expect(def).toBeDefined();
      expect(def!.id).toBe(domain);
      expect(def!.name.length).toBeGreaterThan(0);
    }
  });

  it("each domain has competencies, frameworks, criteria and talking points", () => {
    for (const def of registry.getAll()) {
      expect(def.competencies.length).toBeGreaterThan(0);
      expect(def.competencies.every((c) => c.id && c.name && c.description)).toBe(true);
      expect(def.answerFrameworks.length).toBeGreaterThan(0);
      expect(def.evaluationCriteria.length).toBeGreaterThan(0);
      expect(def.typicalTalkingPoints.length).toBeGreaterThan(0);
    }
  });

  it("distinguishes domains by framework and criteria", () => {
    const se = registry.get("software_engineering")!;
    const hc = registry.get("healthcare_and_clinical")!;

    // Software engineering favors technical explanation frameworks.
    expect(se.answerFrameworks).toContain("TET");
    // Healthcare prioritizes patient safety criteria.
    expect(hc.evaluationCriteria).toContain("patient_safety");
    // They are materially different.
    expect(
      se.evaluationCriteria.some((c) => !hc.evaluationCriteria.includes(c)),
    ).toBe(true);
    expect(
      hc.evaluationCriteria.some((c) => !se.evaluationCriteria.includes(c)),
    ).toBe(true);
  });

  it("default domain falls back to general_employment", () => {
    expect(registry.defaultDomain()).toBe("general_employment");
  });
});
