// ============================================================================
// FILE: core/interview/classification/ProfessionalDomainClassifier.ts
//
// PURPOSE:
// Deterministically classifies interview questions across all major
// professional domains (software, data, finance, healthcare, HR, sales, etc.)
// and detects mixed/cross-domain questions.
// ============================================================================

import type {
  InterviewDomain,
  InterviewDomainClassification,
} from "../../../shared/types/interviews";
import { INTERVIEW_DOMAINS } from "../../../shared/constants/interviewDomains";

const DOMAIN_PATTERNS: Readonly<Record<InterviewDomain, readonly RegExp[]>> = {
  software_engineering: [
    /\b(?:software|code|coding|git|pull request|ci\/cd|api|database|microservice|frontend|backend|fullstack|react|node|typescript|javascript|python|java|golang|rust|c\+\+|refactor|framework|unit test|deploy)\b/i,
    /\b(?:concurrency|caching|latency|throughput|thread|mutex|deadlock|sql|nosql|rest|graphql|docker|kubernetes)\b/i,
    /\b(?:system design|scalab|architecture|distributed system|load balanc)\b/i,
  ],
  data_and_analytics: [
    /\b(?:machine learning|deep learning|neural network|transformer|llm|nlp|computer vision|data science|analytics|dataset)\b/i,
    /\b(?:regression|classification|clustering|pandas|numpy|pytorch|tensorflow|scikit|feature engineering|overfitting)\b/i,
    /\b(?:ab test|hypothesis test|p-value|confidence interval|metric|dashboard|bi|data warehouse|etl|pipeline|bigquery|spark)\b/i,
  ],
  finance_and_accounting: [
    /\b(?:finance|financial|accounting|balance sheet|income statement|cash flow|ebitda|p&l|gaap|ifrs|audit)\b/i,
    /\b(?:valuation|dcf|discounted cash flow|wacc|roi|npv|irr|capital structure|debt|equity|liquidity|working capital)\b/i,
    /\b(?:portfolio|hedging|asset management|investment|financial model|variance analysis|forecast|reconciliation)\b/i,
  ],
  economics: [
    /\b(?:macroeconomics|microeconomics|inflation|interest rate|monetary policy|fiscal policy|elasticity|gdp)\b/i,
    /\b(?:supply and demand|market equilibrium|monopoly|oligopoly|econometric|central bank|exchange rate)\b/i,
  ],
  business_and_management: [
    /\b(?:business model|strategy|strategic|p&l|revenue|cost|margin|growth|market share|competitor|swot)\b/i,
    /\b(?:operating model|stakeholder|board|governance|okr|kpi|executive|cross-functional|restructur)\b/i,
  ],
  sales_and_marketing: [
    /\b(?:sales|pipeline|quota|prospecting|lead generation|conversion rate|cold call|b2b|b2c|closing|crm|salesforce)\b/i,
    /\b(?:marketing|campaign|seo|sem|cac|customer acquisition|churn|retention|brand|funnel|copywriting|positioning)\b/i,
    /\b(?:customer success|upsell|cross-sell|deal size|account executive|sdr|mql|sql)\b/i,
  ],
  customer_service: [
    /\b(?:customer service|customer support|ticket|sla|csat|nps|frt|escalation|angry customer|difficult customer)\b/i,
    /\b(?:call center|helpdesk|client satisfaction|complaint resolution|empathy|de-escalat)\b/i,
  ],
  human_resources: [
    /\b(?:human resources|hr|talent acquisition|recruitment|sourcing|headhunting|onboarding|offboarding)\b/i,
    /\b(?:performance review|employee relations|compensation|benefits|labor law|de&i|diversity|retention rate|culture)\b/i,
    /\b(?:employee engagement|disciplinary|grievance|succession planning|people operations)\b/i,
  ],
  healthcare_and_clinical: [
    /\b(?:patient|clinical|diagnosis|diagnose|diagnostic|treatment|hospital|nursing|physician|doctor|medical|surgery|medication|asthma|pediatric|chronic|disease|symptom)\b/i,
    /\b(?:triage|vital signs|ehr|emr|hipaa|patient care|protocol|bedside|pharmacology|pathology|care plan)\b/i,
    /\b(?:infection control|sterile|dosage|contraindication|code blue|icu|emergency room)\b/i,
  ],
  education_and_academic: [
    /\b(?:teaching|pedagogy|curriculum|classroom|student|lesson plan|assessment|grading|syllabus|differentiated)\b/i,
    /\b(?:learning outcome|faculty|tenure|lecture|higher education|k-12|special education|instructional design)\b/i,
  ],
  engineering_and_trades: [
    /\b(?:mechanical|electrical|civil|chemical engineering|cad|solidworks|hvac|schematic|circuits|plc|welding)\b/i,
    /\b(?:manufacturing|machining|tolerance|stress analysis|structural|thermodynamics|fluid mechanics|voltage)\b/i,
    /\b(?:blueprint|compliance|osha|safety protocol|site inspection|facilities)\b/i,
  ],
  operations_and_logistics: [
    /\b(?:operations|logistics|supply chain|inventory|procurement|warehouse|fulfillment|shipping|freight)\b/i,
    /\b(?:lean|six sigma|kaizen|root cause|jit|just-in-time|bottleneck|throughput|vendor management|3pl)\b/i,
  ],
  consulting_and_strategy: [
    /\b(?:consulting|case interview|market entry|market sizing|framework|m&a|merger|acquisition|profitability)\b/i,
    /\b(?:mece|hypothesis-driven|due diligence|turnaround|synergy|value chain|benchmarking)\b/i,
  ],
  behavioral_and_competency: [
    /\b(?:tell me about a time|describe a time|give me an example of|how did you handle|walk me through a situation)\b/i,
    /\b(?:conflict with a coworker|disagreement with a manager|made a mistake|failed at|under pressure)\b/i,
    /\b(?:faced with tight deadline|went above and beyond|proudest achievement)\b/i,
  ],
  situational: [
    /\b(?:what would you do if|how would you respond if|imagine you are|suppose that|hypothetically)\b/i,
    /\b(?:if a client demands|if a deadline is missed|if you discover an error|scenario)\b/i,
  ],
  leadership_and_management: [
    /\b(?:leadership style|leading a team|managing people|mentoring|delegation|coaching|difficult employee)\b/i,
    /\b(?:inspire|motivate|performance management|underperformer|direct report|conflict resolution in team)\b/i,
  ],
  academic_and_research: [
    /\b(?:research methodology|peer review|grant|publication|literature review|dissertation|postdoc|pi)\b/i,
    /\b(?:statistical significance|experimental design|citation|primary literature|conference presentation)\b/i,
  ],
  general_employment: [
    /\b(?:tell me about yourself|walk me through your resume|why should we hire you|strengths and weaknesses)\b/i,
    /\b(?:why are you leaving|where do you see yourself in 5 years|salary expectation|notice period)\b/i,
    /\b(?:why this company|why this role|what do you know about us)\b/i,
  ],
  technical: [
    /\b(?:technical knowledge|how does .* work|what is the difference between|explain the concept of)\b/i,
  ],
  mixed_domain: [],
};

export class ProfessionalDomainClassifier {
  public classify(questionText: string): InterviewDomainClassification {
    const text = questionText.trim();
    if (!text) {
      return {
        primaryDomain: "general_employment",
        confidence: 0.5,
        secondaryDomains: [],
        signals: ["Empty question text; defaulted to general employment"],
        isMixedDomain: false,
      };
    }

    const domainScores = new Map<InterviewDomain, number>();
    const matchedSignals = new Map<InterviewDomain, string[]>();

    for (const domain of INTERVIEW_DOMAINS) {
      domainScores.set(domain, 0);
      matchedSignals.set(domain, []);
    }

    for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS) as [InterviewDomain, readonly RegExp[]][]) {
      if (domain === "mixed_domain") continue;
      for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match) {
          const current = domainScores.get(domain) ?? 0;
          domainScores.set(domain, current + 1);
          matchedSignals.get(domain)?.push(`Pattern matched: "${match[0]}"`);
        }
      }
    }

    // Rank domains by score
    const scoredDomains = [...domainScores.entries()]
      .filter(([domain, score]) => domain !== "mixed_domain" && score > 0)
      .sort((a, b) => b[1] - a[1]);

    if (scoredDomains.length === 0) {
      return {
        primaryDomain: "general_employment",
        confidence: 0.55,
        secondaryDomains: [],
        signals: ["No specialized domain vocabulary detected; defaulted to general employment"],
        isMixedDomain: false,
      };
    }

    const top = scoredDomains[0];
    const second = scoredDomains[1];
    const totalScore = scoredDomains.reduce((sum, [, score]) => sum + score, 0);

    const primaryConfidence = Math.min(0.95, Math.max(0.5, 0.45 + (top[1] / totalScore) * 0.5));
    const isMixed = Boolean(
      second &&
      second[1] >= 1 &&
      (second[1] / top[1] >= 0.45) &&
      top[0] !== second[0] &&
      !(top[0] === "software_engineering" && second[0] === "technical"),
    );

    const secondaryDomains = scoredDomains.slice(1, 4).map(([domain, score]) => ({
      domain,
      confidence: Math.round((score / totalScore) * 100) / 100,
    }));

    const primarySignals = matchedSignals.get(top[0]) ?? [];
    if (isMixed && second) {
      primarySignals.push(`Mixed domain detected with ${second[0]} (ratio: ${(second[1] / top[1]).toFixed(2)})`);
    }

    return {
      primaryDomain: isMixed && top[1] === second?.[1] ? "mixed_domain" : top[0],
      confidence: primaryConfidence,
      secondaryDomains,
      signals: primarySignals,
      isMixedDomain: isMixed,
    };
  }
}
