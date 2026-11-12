// ============================================================================
// FILE: core/interview/planning/AnswerPlanningEngine.ts
//
// PURPOSE:
// Selects appropriate answer planning frameworks (STAR, STAR-L, PREP, PASR,
// TET, etc.) tailored to the question archetype and professional domain,
// grounding points in candidate evidence and providing honest transferable-skill
// pathways when experience is absent.
// ============================================================================

import type {
  AnswerFramework,
  AnswerPlan,
  AnswerPlanStep,
  InterviewDomain,
  QuestionUnderstanding,
  ResponseMode,
} from "../../../shared/types/interviews";

export interface CandidateEvidenceItem {
  readonly id: string;
  readonly text: string;
  readonly source: string;
  readonly confidence: number;
}

export class AnswerPlanningEngine {
  public plan(
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
    evidenceItems: readonly CandidateEvidenceItem[] = [],
    responseMode: ResponseMode = "professional",
  ): AnswerPlan {
    const framework = this.selectFramework(understanding, domain);
    const steps = this.generateSteps(framework, understanding, domain, evidenceItems);
    const headline = this.generateHeadline(understanding, framework, domain);
    const targetOutcome = this.generateTargetOutcome(understanding, domain);
    const cautions = this.generateCautions(understanding, domain);
    const recommendedEvidenceIds = evidenceItems.map((e) => e.id);

    return {
      question: understanding.rawQuestion,
      domain,
      framework,
      headline,
      steps,
      targetOutcome,
      recommendedEvidenceIds,
      cautions,
      responseMode,
    };
  }

  private selectFramework(
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ): AnswerFramework {
    // 1. Technical explanation or role knowledge
    if (understanding.archetype === "technical_explanation") {
      return "TET"; // Technical Explanation -> Example -> Trade-offs
    }

    // 2. Case study or strategic consulting
    if (understanding.archetype === "case_study" || domain === "consulting_and_strategy") {
      return "CAR_RISKS"; // Case Analysis -> Recommendation -> Risks
    }

    // 3. Problem solving or operations / analytical challenge
    if (understanding.archetype === "problem_solving" || domain === "operations_and_logistics") {
      return "PASR"; // Problem -> Analysis -> Solution -> Result
    }

    // 4. Numerical or quantitative reasoning
    if (understanding.archetype === "numerical_analytical" || domain === "finance_and_accounting") {
      return "CEE"; // Claim -> Evidence -> Explanation
    }

    // 5. Scenario or ethical dilemma
    if (understanding.archetype === "scenario_question" || understanding.archetype === "ethical_dilemma") {
      return "SDO"; // Situation -> Decision -> Outcome
    }

    // 6. Direct opinion questions (Why this role, why hire you, career motivation)
    if (
      understanding.archetype === "why_hire_you" ||
      understanding.archetype === "why_company" ||
      understanding.archetype === "why_role"
    ) {
      return "PREP"; // Point -> Reason -> Example -> Point
    }

    // 7. Clinical, educational or legal domains
    if (domain === "healthcare_and_clinical" || domain === "education_and_academic") {
      return "DOMAIN_REASONING";
    }

    // 8. Behavioral & experience questions
    if (understanding.archetype === "conflict_resolution" || understanding.archetype === "leadership_teamwork") {
      return "STAR_L"; // With explicit Reflection / Learnings
    }

    return "STAR";
  }

  private generateSteps(
    framework: AnswerFramework,
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
    evidenceItems: readonly CandidateEvidenceItem[],
  ): readonly AnswerPlanStep[] {
    const hasEvidence = evidenceItems.length > 0;
    const topEvidence = evidenceItems[0]?.text ?? "";

    switch (framework) {
      case "STAR":
      case "STAR_L": {
        const steps: AnswerPlanStep[] = [
          {
            phase: "Situation",
            instruction: "Briefly set the scene and context (who, where, when, and business/operational context).",
            keyTalkingPoints: [
              hasEvidence ? `Anchor to verified context: ${topEvidence.slice(0, 100)}...` : "Establish a clear, real professional environment.",
              "Keep the context concise (under 20-30 seconds).",
            ],
            requiredEvidenceType: "employment_history",
          },
          {
            phase: "Task",
            instruction: "Clarify your exact responsibility, the hurdle or goal, and why it mattered.",
            keyTalkingPoints: [
              "State the explicit challenge or objective.",
              "Distinguish what you were specifically responsible for vs team responsibilities.",
            ],
          },
          {
            phase: "Action",
            instruction: "Describe the specific steps you personally executed to solve the problem.",
            keyTalkingPoints: [
              "Focus on first-person actions ('I analyzed', 'I designed', 'I convened').",
              "Demonstrate domain expertise and proactive decision making.",
            ],
            requiredEvidenceType: "skills",
          },
          {
            phase: "Result",
            instruction: "Share the measurable, observable outcome and business impact.",
            keyTalkingPoints: [
              "State quantifiable metrics whenever possible (time saved, revenue added, errors reduced).",
              "Connect the result back to stakeholder value.",
            ],
            requiredEvidenceType: "achievements",
          },
        ];

        if (framework === "STAR_L") {
          steps.push({
            phase: "Learnings & Reflection",
            instruction: "Summarize what this experience taught you and how it improved your future practice.",
            keyTalkingPoints: [
              "Demonstrate emotional intelligence and self-awareness.",
              "Explain how this lesson directly benefits the prospective role.",
            ],
          });
        }
        return steps;
      }

      case "TET":
        return [
          {
            phase: "Technical Explanation",
            instruction: "Deliver a crisp, precise definition and core mechanism of the concept.",
            keyTalkingPoints: [
              "Start with a direct 1-2 sentence definition without meandering.",
              "Explain the fundamental mechanism or architecture cleanly.",
            ],
          },
          {
            phase: "Practical Example",
            instruction: "Illustrate the concept with a concrete real-world implementation.",
            keyTalkingPoints: [
              hasEvidence ? `Draw from your experience: ${topEvidence.slice(0, 100)}...` : "Use an industry-standard scenario.",
              "Walk through how inputs translate to outputs or how components interact.",
            ],
          },
          {
            phase: "Trade-offs & Constraints",
            instruction: "Analyze trade-offs, edge cases, alternatives, and production limitations.",
            keyTalkingPoints: [
              "Discuss performance, cost, complexity, or scalability trade-offs.",
              "Show senior engineering judgment: explain when NOT to use this approach.",
            ],
          },
        ];

      case "PASR":
        return [
          {
            phase: "Problem",
            instruction: "Frame the root issue, operational bottleneck, or breakdown.",
            keyTalkingPoints: ["Quantify the initial impact of the problem on operations or customers."],
          },
          {
            phase: "Analysis",
            instruction: "Detail your investigative process, data gathering, and hypothesis testing.",
            keyTalkingPoints: ["Show disciplined root-cause analysis (e.g. 5 Whys, telemetry, audits)."],
          },
          {
            phase: "Solution",
            instruction: "Explain the chosen intervention, architectural fix, or process change.",
            keyTalkingPoints: ["Highlight cross-functional alignment and execution rigor."],
          },
          {
            phase: "Result",
            instruction: "Present the verifiable before-and-after outcome and permanent safeguards added.",
            keyTalkingPoints: ["Cite the concrete resolution metrics and automated preventive measures."],
          },
        ];

      case "PREP":
        return [
          {
            phase: "Point",
            instruction: "State your core thesis or value proposition immediately.",
            keyTalkingPoints: ["Direct, confident declaration directly answering the question."],
          },
          {
            phase: "Reason",
            instruction: "Provide the foundational rationale and professional motivation behind your point.",
            keyTalkingPoints: ["Connect your personal values, strengths, and background to the opportunity."],
          },
          {
            phase: "Example",
            instruction: "Back your reasoning with a concrete accomplishment or track record.",
            keyTalkingPoints: [
              hasEvidence ? `Reference proven achievement: ${topEvidence.slice(0, 100)}...` : "Highlight demonstrated success from past projects.",
            ],
          },
          {
            phase: "Point (Reiteration)",
            instruction: "Reiterate your key message and connect it to immediate value in the new role.",
            keyTalkingPoints: ["Leave the interviewer with a memorable takeaway."],
          },
        ];

      case "CAR_RISKS":
        return [
          {
            phase: "Case Analysis & Diagnosis",
            instruction: "Structure the problem, clarify assumptions, and segment key drivers.",
            keyTalkingPoints: ["Use MECE (Mutually Exclusive, Collectively Exhaustive) structure.", "State assumptions transparently."],
          },
          {
            phase: "Strategic Recommendation",
            instruction: "Provide a prioritized, actionable recommendation with expected upside.",
            keyTalkingPoints: ["Clear prioritization of initiatives based on effort vs impact."],
          },
          {
            phase: "Risks & Mitigations",
            instruction: "Proactively identify 2-3 execution or market risks and their mitigations.",
            keyTalkingPoints: ["Demonstrate strategic realism and proactive contingency planning."],
          },
        ];

      case "SDO":
        return [
          {
            phase: "Situation & Dilemma",
            instruction: "Define the situational parameters, competing priorities, or ethical tension.",
            keyTalkingPoints: ["Acknowledge the nuances and stakeholder concerns."],
          },
          {
            phase: "Decision & Rationale",
            instruction: "State your decisive action and the professional principle guiding it.",
            keyTalkingPoints: ["Show commitment to compliance, customer trust, and long-term value."],
          },
          {
            phase: "Outcome & Follow-Through",
            instruction: "Describe how the decision was received, the resolution, and relationship health.",
            keyTalkingPoints: ["Demonstrate that integrity and composure were maintained."],
          },
        ];

      case "CEE":
        return [
          {
            phase: "Claim",
            instruction: "State the quantitative finding, financial thesis, or analytical conclusion.",
            keyTalkingPoints: ["Precise statement with the target figure or variance."],
          },
          {
            phase: "Evidence",
            instruction: "Present the supporting data, financial metrics, and methodology.",
            keyTalkingPoints: ["Cite the exact models, datasets, or accounting formulas utilized."],
          },
          {
            phase: "Explanation",
            instruction: "Translate the numerical findings into business implications and actions.",
            keyTalkingPoints: ["Explain the operational impact and strategic recommendations."],
          },
        ];

      case "DOMAIN_REASONING":
      default:
        return [
          {
            phase: "Standard / Framework Baseline",
            instruction: `Anchor your reasoning in established professional standards for ${domain}.`,
            keyTalkingPoints: ["Reference accepted guidelines, protocols, or industry standard practices."],
          },
          {
            phase: "Application & Execution",
            instruction: "Walk through your deliberate, compliant methodology step-by-step.",
            keyTalkingPoints: ["Emphasize safety, accuracy, and thorough documentation."],
          },
          {
            phase: "Evaluation & Quality Assurance",
            instruction: "Explain how you monitor outcomes and ensure continuous quality.",
            keyTalkingPoints: ["Highlight feedback loops, audits, and patient/student/client safety."],
          },
        ];
    }
  }

  private generateHeadline(
    understanding: QuestionUnderstanding,
    framework: AnswerFramework,
    domain: InterviewDomain,
  ): string {
    return `Structured ${framework} strategy for ${domain.replace(/_/g, " ")}: ${understanding.coreIntent}`;
  }

  private generateTargetOutcome(
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ): string {
    return `Demonstrate mastery in ${understanding.assessedCompetencies.slice(0, 3).join(", ")} grounded in authentic candidate credentials.`;
  }

  private generateCautions(
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ): readonly string[] {
    const cautions: string[] = [
      "Do NOT fabricate experience, metrics, or credentials not supported by candidate evidence.",
      "If you lack direct experience with an exact tool, pivot honestly using transferable skills.",
    ];

    if (domain === "healthcare_and_clinical") {
      cautions.push("Adhere strictly to clinical protocol and patient safety bounds; do not speculate on unverified treatments.");
    } else if (domain === "finance_and_accounting") {
      cautions.push("Maintain GAAP/IFRS terminology accuracy and avoid vague round numbers without basis.");
    } else if (domain === "software_engineering") {
      cautions.push("Avoid buzzword soup; explain the underlying trade-offs and runtime characteristics.");
    }

    if (understanding.isAmbiguous) {
      cautions.push("Consider asking a quick 5-second clarifying question before diving into a lengthy assumption-heavy answer.");
    }

    return cautions;
  }
}
