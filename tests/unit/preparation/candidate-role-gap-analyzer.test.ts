import { describe, expect, it } from "vitest";

import { CandidateRoleGapAnalyzer } from "../../../core/preparation/CandidateRoleGapAnalyzer";
import { JobDescriptionAnalyzer } from "../../../core/preparation/JobDescriptionAnalyzer";

describe("CandidateRoleGapAnalyzer (Phase 17)", () => {
  const analyzer = new CandidateRoleGapAnalyzer();
  const jdAnalyzer = new JobDescriptionAnalyzer();

  it("produces strong matches, partial matches and missing evidence", () => {
    const jd = jdAnalyzer.analyze({
      jobDescriptionText: `
Software Engineer - Payments
Responsibilities:
- Design and implement payment APIs
- Lead code reviews
Requirements:
- 5+ years of Python or Java experience
- Distributed systems and event-driven architecture
Preferred:
- AWS experience
      `,
    });

    const evidence = [
      { id: "e1", text: "5 years of Python and Java development building backend services.", source: "resume", verified: true },
      { id: "e2", text: "Led a team of 6 engineers as tech lead, providing engineering leadership and mentorship.", source: "resume", verified: true },
    ];

    const gap = analyzer.analyze({
      candidateId: "cand-1",
      jobDescriptionAnalysis: jd,
      candidateEvidence: evidence,
    });

    expect(gap.candidateId).toBe("cand-1");
    expect(gap.overallFitScore).toBeGreaterThan(0);
    expect(gap.overallFitScore).toBeLessThanOrEqual(100);

    const strongTitles = gap.strongMatches.map((g) => g.requirementTitle);
    expect(strongTitles.some((t) => t.toLowerCase().includes("python") || t.toLowerCase().includes("java"))).toBe(true);

    const missingTitles = gap.missingEvidence.map((g) => g.requirementTitle);
    expect(missingTitles.some((t) => t.toLowerCase().includes("aws"))).toBe(true);

    for (const g of [...gap.strongMatches, ...gap.partialMatches, ...gap.missingEvidence]) {
      expect(g.confidence).toBeGreaterThanOrEqual(0);
      expect(g.confidence).toBeLessThanOrEqual(1);
      expect(g.explanation.length).toBeGreaterThan(0);
      expect(typeof g.practiceRecommended).toBe("boolean");
    }
  });

  it("scores highly when all requirements are strongly matched", () => {
    const jd = jdAnalyzer.analyze({
      jobDescriptionText: `
Requirements:
- Python experience
- Team leadership
      `,
    });

    const evidence = [
      { id: "e1", text: "5 years of Python and Java experience building backend services.", source: "resume", verified: true },
      { id: "e2", text: "Led a team of 6 engineers as tech lead, providing engineering leadership and mentorship.", source: "resume", verified: true },
    ];

    const gap = analyzer.analyze({
      candidateId: "cand-1",
      jobDescriptionAnalysis: jd,
      candidateEvidence: evidence,
    });

    expect(gap.overallFitScore).toBeGreaterThanOrEqual(90);
    expect(gap.missingEvidence.length).toBe(0);
  });

  it("scores low when no evidence matches", () => {
    const jd = jdAnalyzer.analyze({
      jobDescriptionText: `
Requirements:
- Kubernetes experience
- Distributed systems architecture
      `,
    });

    const evidence = [
      { id: "e1", text: "Customer support and ticket triage experience.", source: "resume", verified: true },
    ];

    const gap = analyzer.analyze({
      candidateId: "cand-1",
      jobDescriptionAnalysis: jd,
      candidateEvidence: evidence,
    });

    expect(gap.overallFitScore).toBeLessThan(50);
    expect(gap.missingEvidence.length).toBeGreaterThan(0);
  });
});
