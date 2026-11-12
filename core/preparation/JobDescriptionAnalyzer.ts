// ============================================================================
// FILE: core/preparation/JobDescriptionAnalyzer.ts
// PURPOSE:
// Deterministic job description analysis (Phase 17).
//
// Extracts structured role requirements from a job description text without
// calling any AI provider. Results carry source excerpt IDs so every
// requirement can be traced back to the original text.
//
// ARCHITECTURAL RULE:
// Pure function over the JD text. No network, no model download, no paid API.
// Reused by the candidate-role gap analyzer and preparation planner.
// ============================================================================

import type {
  JobDescriptionAnalysis,
  RoleRequirement,
  Seniority,
} from "../../../shared/types/preparation";

const SENIORITY_KEYWORDS: ReadonlyMap<Seniority, readonly string[]> = new Map([
  [
    "executive",
    ["vp", "vice president", "director", "head of", "chief", "cxo", "svp"],
  ],
  [
    "lead",
    ["lead", "principal", "staff", "senior lead", "team lead"],
  ],
  [
    "senior",
    ["senior", "sr.", "sr ", "advanced"],
  ],
  [
    "mid",
    ["mid", "intermediate", "experienced"],
  ],
  [
    "entry",
    ["entry", "junior", "associate", "graduate", "new grad"],
  ],
]);

const DOMAIN_KEYWORDS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    "software_engineering",
    [
      "software", "engineer", "developer", "coding", "git", "api", "frontend",
      "backend", "fullstack", "react", "node", "typescript", "javascript",
      "python", "java", "microservice", "database", "system design",
    ],
  ],
  [
    "data_and_analytics",
    [
      "data science", "analytics", "sql", "machine learning", "pandas",
      "tableau", "power bi", "etl", "dashboard", "statistics",
    ],
  ],
  [
    "finance_and_accounting",
    ["finance", "financial", "accounting", "dcf", "valuation", "ebitda",
     "gaap", "audit", "budget", "forecast"],
  ],
  [
    "business_and_management",
    ["business", "management", "strategy", "operations", "p&l", "kpi",
     "stakeholder", "executive"],
  ],
  [
    "sales_and_marketing",
    ["sales", "marketing", "revenue", "quota", "prospecting", "campaign",
     "customer acquisition", "crm"],
  ],
  [
    "healthcare_and_clinical",
    ["healthcare", "clinical", "patient", "nursing", "medical", "diagnosis",
     "triage", "hospital"],
  ],
  [
    "education_and_academic",
    ["education", "teaching", "academic", "curriculum", "lesson", "student",
     "pedagogy"],
  ],
]);

// ============================================================================
// ANALYZER
// ============================================================================

export class JobDescriptionAnalyzer {
  public analyze(input: JobDescriptionAnalysisInput): JobDescriptionAnalysis {
    const text = input.jobDescriptionText ?? "";
    const normalized = text.toLowerCase();
    const id = `jd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const jobTitle =
      input.jobTitle ?? this.extractJobTitle(text) ?? "Untitled Role";
    const company = input.company ?? undefined;
    const seniority = this.inferSeniority(jobTitle, normalized);
    const domain = this.inferDomain(normalized);
    const domainConfidence = this.domainConfidence(normalized, domain);

    const sections = this.separateSections(normalized);

    const requiredSkills = this.extractList(sections.requirements);
    const preferredSkills = this.extractList(sections.preferred);
    const qualifications = this.extractList(sections.qualifications);
    const responsibilities = this.extractList(sections.responsibilities);

    const requirements: RoleRequirement[] = [
      ...requiredSkills.map((s, i) => ({
        id: `req-req-${i}`,
        category: "required" as const,
        title: s,
        description: s,
        matched: false,
        confidence: 0.8,
        supportingEvidenceIds: [],
      })),
      ...preferredSkills.map((s, i) => ({
        id: `req-pref-${i}`,
        category: "preferred" as const,
        title: s,
        description: s,
        matched: false,
        confidence: 0.6,
        supportingEvidenceIds: [],
      })),
      ...qualifications.map((q, i) => ({
        id: `req-qual-${i}`,
        category: "qualification" as const,
        title: q,
        description: q,
        matched: false,
        confidence: 0.7,
        supportingEvidenceIds: [],
      })),
    ];

    const likelyTopics = this.inferTopics(normalized, domain);

    return Object.freeze({
      id,
      jobTitle,
      company,
      seniority,
      domain,
      domainConfidence,
      requiredSkills: Object.freeze(requiredSkills),
      preferredSkills: Object.freeze(preferredSkills),
      responsibilities: Object.freeze(responsibilities),
      qualifications: Object.freeze(qualifications),
      requirements: Object.freeze(requirements),
      likelyTopics: Object.freeze(likelyTopics),
      sourceExcerptIds: Object.freeze([id]),
      analyzedAt: new Date().toISOString(),
    });
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private extractJobTitle(text: string): string | undefined {
    const firstLine = text.split("\n")[0]?.trim();
    if (firstLine && firstLine.length > 3 && firstLine.length < 120) {
      return firstLine;
    }
    return undefined;
  }

  private inferSeniority(jobTitle: string, normalizedJd?: string): Seniority {
    const haystack = jobTitle.toLowerCase();
    for (const [seniority, keywords] of SENIORITY_KEYWORDS) {
      if (keywords.some((k) => haystack.includes(k))) {
        return seniority;
      }
    }
    // Fallback: only entry-level keywords from the full JD, so a job title
    // like "Office Assistant" with a body mentioning "data entry" is entry.
    if (normalizedJd) {
      const entryKeywords = ["entry", "junior", "associate", "graduate", "new grad"];
      if (entryKeywords.some((k) => normalizedJd.includes(k))) {
        return "entry";
      }
    }
    return "mid";
  }

  private inferDomain(normalized: string): string {
    let best = "general_employment";
    let bestCount = 0;
    for (const [domain, keywords] of DOMAIN_KEYWORDS) {
      const count = keywords.filter((k) => normalized.includes(k)).length;
      if (count > bestCount) {
        best = domain as any;
        bestCount = count;
      }
    }
    return bestCount >= 2 ? best : "general_employment";
  }

  private domainConfidence(normalized: string, domain: string): number {
    const keywords = DOMAIN_KEYWORDS.get(domain) ?? [];
    const matches = keywords.filter((k) => normalized.includes(k)).length;
    return Math.min(1, matches / Math.max(keywords.length, 1));
  }

  private separateSections(normalized: string): {
    requirements: string[];
    preferred: string[];
    qualifications: string[];
    responsibilities: string[];
  } {
    const sections: Record<string, string[]> = {
      requirements: [],
      preferred: [],
      qualifications: [],
      responsibilities: [],
    };

    const lines = normalized.split("\n");
    let current: string | null = null;

    const headerMap: ReadonlyArray<[string, string]> = [
      ["requirements", "requirements"],
      ["required", "requirements"],
      ["preferred", "preferred"],
      ["qualifications", "qualifications"],
      ["responsibilities", "responsibilities"],
      ["duties", "responsibilities"],
      ["role overview", "responsibilities"],
      ["you will", "responsibilities"],
    ];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();

      // Detect a header line (short, ends with colon or is title-case-ish)
      const isHeader =
        trimmed.length < 60 &&
        (lower.endsWith(":") ||
          lower === "requirements" ||
          lower === "preferred" ||
          lower === "qualifications" ||
          lower === "responsibilities") &&
        !lower.includes(".") &&
        trimmed.split(" ").length <= 6;

      if (isHeader) {
        let target: string | null = null;
        for (const [key, category] of headerMap) {
          if (lower === key || lower.includes(key)) {
            target = category;
            break;
          }
        }
        current = target;
        continue;
      }

      // A bullet or sentence belongs to the current section
      if (current && trimmed.length > 2) {
        const cleaned = trimmed.replace(/^[•\-•*0-9.]\s*/, "");
        if (cleaned.length > 0) {
          sections[current].push(cleaned);
        }
      }
    }

    return sections as {
      requirements: string[];
      preferred: string[];
      qualifications: string[];
      responsibilities: string[];
    };
  }

  private extractList(items: readonly string[]): string[] {
    return items
      .map((i) => i.trim())
      .filter((i) => i.length > 2 && i.length < 100)
      .slice(0, 15);
  }

  private inferTopics(normalized: string, domain: string): string[] {
    const topics: string[] = [];
    const topicKeywords: ReadonlyMap<string, readonly string[]> = new Map([
      ["system_design", ["system design", "architecture", "scalability"]],
      ["coding", ["coding", "algorithm", "data structure"]],
      ["behavioral", ["behavioral", "tell me about a time"]],
      ["case_study", ["case study", "market sizing", "profitability"]],
      ["communication", ["communication", "presentation", "stakeholder"]],
      ["leadership", ["leadership", "leading", "managing people"]],
    ]);
    for (const [topic, keywords] of topicKeywords) {
      if (keywords.some((k) => normalized.includes(k))) {
        topics.push(topic);
      }
    }
    return topics.slice(0, 8);
  }
}
