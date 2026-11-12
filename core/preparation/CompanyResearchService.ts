// ============================================================================
// FILE: core/preparation/CompanyResearchService.ts
// PURPOSE:
// Company research service (Phase 17).
//
// Organizes company research from user-provided or public sources with full
// source provenance. It does NOT scrape, browse or download anything; it only
// organizes materials the user has explicitly provided or marked as public.
//
// ARCHITECTURAL RULE:
// No external network access. User-provided research is clearly attributed so
// the candidate can distinguish sourced facts from AI-generated suggestions.
// ============================================================================

import type {
  CompanyResearch,
  CompanyResearchSource,
  ResearchSourceType,
} from "../../../shared/types/preparation";

export interface CompanyResearchInput {
  readonly companyName: string;
  readonly sources: readonly {
    readonly title: string;
    readonly type: ResearchSourceType;
    readonly url?: string;
    readonly content: string;
  }[];
}

export class CompanyResearchService {
  public research(input: CompanyResearchInput): CompanyResearch {
    const sources: CompanyResearchSource[] = input.sources.map((s, i) => ({
      id: `source-${i}`,
      type: s.type,
      title: s.title,
      url: s.url,
      retrievedAt: new Date().toISOString(),
      contentSummary: this.summarize(s.content),
    }));

    const industry = this.inferIndustry(sources);
    const businessModel = this.inferBusinessModel(sources);
    const recentDevelopments = this.extractDevelopments(sources);
    const valuesAndCulture = this.extractValues(sources);
    const roleRelevance = this.inferRoleRelevance(sources);
    const candidateQuestions = this.generateQuestions(sources, industry);

    return Object.freeze({
      companyName: input.companyName,
      sources: Object.freeze(sources),
      industry,
      businessModel,
      recentDevelopments: Object.freeze(recentDevelopments),
      valuesAndCulture: Object.freeze(valuesAndCulture),
      roleRelevance: Object.freeze(roleRelevance),
      candidateQuestions: Object.freeze(candidateQuestions),
      provenanceNote:
        "All company information above comes from the listed user-provided or public sources. Unlisted claims are not sourced and should not be treated as fact.",
    });
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private summarize(content: string): string {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    return sentences.slice(0, 3).map((s) => s.trim()).join(" ").slice(0, 400);
  }

  private inferIndustry(sources: readonly { readonly content: string }[]): string | undefined {
    const text = sources.map((s) => (s.content ?? "").toLowerCase()).join(" ");
    const industries: ReadonlyArray<[string, readonly string[]]> = [
      ["technology", ["software", "saas", "platform", "api", "cloud"]],
      ["healthcare", ["patient", "clinical", "hospital", "medical"]],
      ["finance", ["banking", "investment", "financial", "trading"]],
      ["retail", ["retail", "consumer", "e-commerce", "store"]],
      ["manufacturing", ["manufacturing", "factory", "production", "supply chain"]],
    ];
    for (const [ind, kws] of industries) {
      if (kws.some((k) => text.includes(k))) return ind;
    }
    return undefined;
  }

  private inferBusinessModel(sources: readonly { readonly content: string }[]): string | undefined {
    const text = sources.map((s) => (s.content ?? "").toLowerCase()).join(" ");
    if (text.includes("subscription") || text.includes("saas")) return "Subscription/SaaS";
    if (text.includes("marketplace")) return "Marketplace";
    if (text.includes("advertis") || text.includes("ad ") ) return "Advertising";
    if (text.includes("e-commerce") || text.includes("sell")) return "E-commerce";
    return undefined;
  }

  private extractDevelopments(sources: readonly { readonly content: string }[]): string[] {
    const developments: string[] = [];
    for (const s of sources) {
      for (const sentence of (s.content ?? "").split(/[.!?]+/)) {
        const t = sentence.trim();
        if (/^(recently|launched|announced|acquired|raised|expanded|partnered)/i.test(t)) {
          developments.push(t);
        }
      }
    }
    return developments.slice(0, 5);
  }

  private extractValues(sources: readonly { readonly content: string }[]): string[] {
    const values: string[] = [];
    const valueKeywords = ["integrity", "innovation", "customer", "excellence", "collaboration", "transparency", "respect"];
    const text = sources.map((s) => (s.content ?? "").toLowerCase()).join(" ");
    for (const v of valueKeywords) {
      if (text.includes(v)) values.push(v.charAt(0).toUpperCase() + v.slice(1));
    }
    return values.slice(0, 6);
  }

  private inferRoleRelevance(sources: readonly { readonly content: string }[]): string[] {
    const relevance: string[] = [];
    const roleKeywords = ["engineer", "manager", "analyst", "designer", "sales", "product"];
    const text = sources.map((s) => (s.content ?? "").toLowerCase()).join(" ");
    for (const r of roleKeywords) {
      if (text.includes(r)) relevance.push(r);
    }
    return relevance.slice(0, 5);
  }

  private generateQuestions(sources: readonly { readonly content: string }[], industry: string | undefined): string[] {
    const questions: string[] = [
      "How does this role contribute to the company's top priorities?",
      "What does success look like in this role after six months?",
    ];
    if (industry) {
      questions.push(`How is ${industry} changing the company's strategy right now?`);
    }
    if (sources.some((s) => (s.content ?? "").toLowerCase().includes("growth"))) {
      questions.push("What are the company's growth plans for the next year?");
    }
    questions.push("What do you enjoy most about working here?");
    return questions.slice(0, 5);
  }
}
