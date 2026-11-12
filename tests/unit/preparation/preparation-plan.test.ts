import { describe, expect, it } from "vitest";

import { PreparationPlanService } from "../../../core/preparation/PreparationPlanService";
import { CompanyResearchService } from "../../../core/preparation/CompanyResearchService";
import { JobDescriptionAnalyzer } from "../../../core/preparation/JobDescriptionAnalyzer";
import { CandidateRoleGapAnalyzer } from "../../../core/preparation/CandidateRoleGapAnalyzer";

describe("PreparationPlanService + CompanyResearchService (Phase 17)", () => {
  const jdAnalyzer = new JobDescriptionAnalyzer();
  const gapAnalyzer = new CandidateRoleGapAnalyzer();
  const planService = new PreparationPlanService();
  const researchService = new CompanyResearchService();

  it("generates a personalised preparation plan from a JD and gap analysis", () => {
    const jd = jdAnalyzer.analyze({
      jobDescriptionText: `
Senior Software Engineer - Payments
Responsibilities:
- Design and implement payment APIs
- Lead code reviews and mentor junior engineers
Requirements:
- 5+ years of Python or Java experience
- Distributed systems and event-driven architecture
Preferred:
- AWS experience
      `,
      jobTitle: "Senior Software Engineer - Payments",
      company: "PayCo",
    });

    const evidence = [
      { id: "e1", text: "Built payment APIs with Python for 4 years.", source: "resume", verified: true },
      { id: "e2", text: "Led code reviews for a team of 3.", source: "resume", verified: true },
    ];

    const gap = gapAnalyzer.analyze({
      candidateId: "cand-1",
      jobDescriptionAnalysis: jd,
      candidateEvidence: evidence,
    });

    const research = researchService.research({
      companyName: "PayCo",
      sources: [
        {
          title: "PayCo About Page",
          type: "company_website",
          url: "https://payco.example.com/about",
          content: "PayCo is a fintech company building payment infrastructure. We value integrity, innovation and customer obsession. Recently launched a new cross-border payments product.",
        },
      ],
    });

    const plan = planService.plan({
      candidateId: "cand-1",
      jobDescriptionAnalysis: jd,
      gapAnalysis: gap,
      companyResearch: research,
      domainIntelligence: {
        domain: "software_engineering",
        competencies: ["coding", "system_design", "debugging"],
      },
    });

    expect(plan.roleTitle).toBe("Senior Software Engineer - Payments");
    expect(plan.domain).toBe("software_engineering");
    expect(plan.overallFitScore).toBeGreaterThan(0);
    expect(plan.overallFitScore).toBeLessThanOrEqual(100);
    expect(plan.activities.length).toBeGreaterThan(0);
    expect(plan.studyPriorities.length).toBeGreaterThan(0);
    expect(plan.questionsToAskEmployer.length).toBeGreaterThan(0);
    expect(plan.mockInterviewConfig.domain).toBe("software_engineering");
    expect(plan.mockInterviewConfig.questionCount).toBeGreaterThan(0);
    expect(plan.companyResearch?.companyName).toBe("PayCo");
    expect(plan.companyResearch?.provenanceNote).toContain("sourced");
  });

  it("company research attributes sources and marks unsourced claims", () => {
    const research = researchService.research({
      companyName: "Acme Corp",
      sources: [
        {
          title: "Acme Blog",
          type: "public",
          url: "https://acme.example.com/blog",
          content: "Acme launched a new AI platform last month and doubled its enterprise customer base.",
        },
      ],
    });

    expect(research.companyName).toBe("Acme Corp");
    expect(research.sources.length).toBe(1);
    expect(research.sources[0].type).toBe("public");
    expect(resourcesHaveProvenance(research)).toBe(true);
    expect(research.provenanceNote).toContain("sourced");
  });

  it("handles a company with no research gracefully", () => {
    const plan = planService.plan({
      candidateId: "cand-1",
      jobDescriptionAnalysis: jdAnalyzer.analyze({
        jobTitle: "Data Analyst",
        jobDescriptionText: "Data Analyst role. Requirements: SQL, Python, statistics.",
      }),
      gapAnalysis: gapAnalyzer.analyze({
        candidateId: "cand-1",
        jobDescriptionAnalysis: jdAnalyzer.analyze({
          jobTitle: "Data Analyst",
          jobDescriptionText: "Data Analyst role. Requirements: SQL, Python, statistics.",
        }),
        candidateEvidence: [
          { id: "e1", text: "3 years of SQL and Python for data analysis.", source: "resume", verified: true },
        ],
      }),
    });

    expect(plan.roleTitle).toBe("Data Analyst");
    expect(plan.companyResearch).toBeUndefined();
    expect(plan.activities.length).toBeGreaterThan(0);
  });

  function resourcesHaveProvenance(research: { readonly sources: readonly { readonly id: string; readonly title: string }[] }) {
    return research.sources.every((s) => s.id && s.title);
  }
});
