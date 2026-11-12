// ============================================================================
// FILE: core/interview/followup/FollowUpIntelligenceEngine.ts
//
// PURPOSE:
// Generates realistic interviewer follow-up questions grounded directly in the
// candidate's previous response (evidence probing, assumption challenges,
// learning reflection, technical deep dives).
// ============================================================================

import type {
  FollowUpQuestion,
  InterviewDomain,
  QuestionUnderstanding,
} from "../../../shared/types/interviews";

export class FollowUpIntelligenceEngine {
  public generateFollowUps(
    previousAnswerText: string,
    understanding: QuestionUnderstanding,
    domain: InterviewDomain,
  ): readonly FollowUpQuestion[] {
    const text = previousAnswerText.trim();
    if (!text) {
      return [
        {
          questionText: "Could you walk me through a specific example to help me picture that?",
          rationale: "Prompting for concrete experience when answer is absent or minimal.",
          type: "probe_evidence",
        },
      ];
    }

    const followUps: FollowUpQuestion[] = [];
    const hasNumbers = /\b(?:\d+%|\$\d+|\d+)\b/.test(text);
    const mentionsTeam = /\b(?:we|our team|colleagues|group)\b/i.test(text);
    const mentionsFailure = /\b(?:mistake|failed|challenge|error|delay|bug)\b/i.test(text);

    // 1. Evidence Probing / Numerical Details
    if (!hasNumbers) {
      followUps.push({
        questionText: "What was the measurable outcome or quantitative impact of that initiative?",
        rationale: "The candidate's response lacked specific metrics or numbers.",
        type: "numerical_detail",
        relevantPreviousAnswerExcerpt: text.slice(0, 120),
      });
    }

    // 2. Personal Ownership Check
    if (mentionsTeam && !/\b(?:i personally|my role specifically|i decided)\b/i.test(text)) {
      followUps.push({
        questionText: "You mentioned the team achieved this—what was your specific individual contribution to that outcome?",
        rationale: "Disentangling individual ownership from collective team effort.",
        type: "probe_evidence",
      });
    }

    // 3. Learning / What would you do differently
    followUps.push({
      questionText: "Looking back on that situation now, what would you do differently if you had to approach it again?",
      rationale: "Testing self-awareness, learning reflection, and continuous improvement.",
      type: "learning_reflection",
    });

    // 4. Decision Deep-Dive or Assumption Challenge
    if (domain === "software_engineering" || domain === "technical" || domain === "data_and_analytics") {
      followUps.push({
        questionText: "What trade-offs did you evaluate when choosing that specific architecture or technology over alternative options?",
        rationale: "Probing engineering judgment and awareness of trade-offs.",
        type: "decision_deep_dive",
      });
    } else if (domain === "finance_and_accounting" || domain === "consulting_and_strategy") {
      followUps.push({
        questionText: "What key assumptions did your analysis rely upon, and how sensitive were your conclusions if those assumptions changed?",
        rationale: "Testing analytical rigor and risk sensitivity.",
        type: "challenge_assumption",
      });
    } else if (domain === "healthcare_and_clinical") {
      followUps.push({
        questionText: "How did you ensure compliance with patient safety protocols while managing that situation?",
        rationale: "Verifying adherence to clinical standards and patient safety.",
        type: "decision_deep_dive",
      });
    }

    // 5. Handling Failure / Friction
    if (mentionsFailure) {
      followUps.push({
        questionText: "How did stakeholders react when that challenge occurred, and how did you manage their expectations?",
        rationale: "Assessing crisis management and stakeholder communication under pressure.",
        type: "failure_handling",
      });
    }

    return followUps.slice(0, 3);
  }
}
