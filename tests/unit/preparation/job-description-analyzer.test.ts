import { describe, expect, it } from "vitest";

import { JobDescriptionAnalyzer } from "../../../core/preparation/JobDescriptionAnalyzer";

describe("JobDescriptionAnalyzer (Phase 17)", () => {
  const analyzer = new JobDescriptionAnalyzer();

  it("extracts job title, seniority, domain and requirements from a JD", () => {
    const jd = `
Senior Software Engineer - Payments
We are hiring a Senior Software Engineer to join our payments team.
Responsibilities:
- Design and implement payment APIs
- Lead code reviews and mentor junior engineers
Requirements:
- 5+ years of Python or Java experience
- Distributed systems and event-driven architecture
- Bachelor's degree in Computer Science
Preferred:
- AWS or GCP experience
- Stripe or payment gateway integration
    `;

    const result = analyzer.analyze({
      jobDescriptionText: jd,
      jobTitle: "Senior Software Engineer - Payments",
      company: "PayCo",
    });

    expect(result.jobTitle).toBe("Senior Software Engineer - Payments");
    expect(result.company).toBe("PayCo");
    expect(result.seniority).toBe("senior");
    expect(result.domain).toBe("software_engineering");
    expect(result.requiredSkills.length).toBeGreaterThan(0);
    expect(result.responsibilities.length).toBeGreaterThan(0);
    expect(result.requirements.length).toBeGreaterThan(0);
    expect(result.likelyTopics.length).toBeGreaterThan(0);
    expect(result.domainConfidence).toBeGreaterThan(0);
    expect(result.domainConfidence).toBeLessThanOrEqual(1);
  });

  it("defaults to entry level and general employment when signals are absent", () => {
    const result = analyzer.analyze({
      jobDescriptionText: "We need someone to help with general office tasks and data entry.",
      jobTitle: "Office Assistant",
    });

    expect(result.seniority).toBe("entry");
    expect(result.domain).toBe("general_employment");
    expect(result.jobTitle).toBe("Office Assistant");
  });

  it("produces a stable id and analyzed timestamp", () => {
    const a = analyzer.analyze({ jobDescriptionText: "Build APIs with Python." });
    const b = analyzer.analyze({ jobDescriptionText: "Build APIs with Python." });
    expect(a.id).not.toBe(b.id);
    expect(new Date(a.analyzedAt).getTime()).toBeGreaterThan(0);
  });
});
