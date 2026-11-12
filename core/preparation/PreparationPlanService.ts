// ============================================================================
// FILE: core/preparation/PreparationPlanService.ts
// PURPOSE:
// Personalised preparation plan generation (Phase 17).
//
// Combines a candidate profile, job description analysis, gap analysis,
// company research and domain intelligence into a personalised preparation
// plan with activities, study priorities, employer questions and a mock
// interview configuration.
//
// ARCHITECTURAL RULE:
// Deterministic assembly of inputs. No AI provider. The plan feeds directly
// into the canonical interview runtime for mock interview sessions.
// ============================================================================

import type {
  GapAnalysis,
  JobDescriptionAnalysis,
  PreparationActivity,
  PreparationPlan,
  MockInterviewConfig,
  CompanyResearch,
} from "../../../shared/types/preparation";

export interface PreparationPlanInput {
  readonly candidateId: string;
  readonly jobDescriptionAnalysis: JobDescriptionAnalysis;
  readonly gapAnalysis: GapAnalysis;
  readonly companyResearch?: CompanyResearch;
  readonly domainIntelligence?: {
    readonly domain: string;
    readonly competencies: readonly string[];
  };
}

export class PreparationPlanService {
  public plan(input: PreparationPlanInput): PreparationPlan {
    const { gapAnalysis, jobDescriptionAnalysis, domainIntelligence } = input;

    const activities = this.buildActivities(gapAnalysis, jobDescriptionAnalysis, domainIntelligence);
    const studyPriorities = this.buildStudyPriorities(gapAnalysis);
    const questionsToAskEmployer = this.buildQuestionsToAskEmployer(input.companyResearch, jobDescriptionAnalysis);
    const mockInterviewConfig = this.buildMockInterviewConfig(jobDescriptionAnalysis, domainIntelligence);

    return Object.freeze({
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jobDescriptionId: jobDescriptionAnalysis.id,
      candidateId: input.candidateId,
      roleTitle: jobDescriptionAnalysis.jobTitle,
      domain: domainIntelligence?.domain ?? jobDescriptionAnalysis.domain,
      overallFitScore: gapAnalysis.overallFitScore,
      priorityGaps: Object.freeze(gapAnalysis.missingEvidence.map((g) => g.requirementTitle)),
      activities: Object.freeze(activities),
      companyResearch: input.companyResearch ?? undefined,
      studyPriorities: Object.freeze(studyPriorities),
      questionsToAskEmployer: Object.freeze(questionsToAskEmployer),
      mockInterviewConfig: Object.freeze(mockInterviewConfig),
      generatedAt: new Date().toISOString(),
    });
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  private buildActivities(
    gapAnalysis: GapAnalysis,
    jda: JobDescriptionAnalysis,
    domainIntelligence?: PreparationPlanInput["domainIntelligence"],
  ): PreparationActivity[] {
    const activities: PreparationActivity[] = [];

    // Missing evidence -> concept study + example review activities.
    for (const gap of gapAnalysis.missingEvidence.slice(0, 5)) {
      activities.push({
        id: `activity-${gap.requirementId}`,
        title: `Study: ${gap.requirementTitle}`,
        description: `Build evidence for "${gap.requirementTitle}" which is missing from your profile.`,
        type: "concept_study",
        relatedRequirementId: gap.requirementId,
        relatedCompetency: gap.requirementTitle,
        exampleQuestion: `Tell me about a time you demonstrated ${gap.requirementTitle.toLowerCase()}.`,
        targetImprovement: gap.requirementTitle,
        measurableGoal: `Add one verified evidence item for ${gap.requirementTitle}.`,
      });
    }

    // Partial matches -> practice questions.
    for (const gap of gapAnalysis.partialMatches.slice(0, 3)) {
      activities.push({
        id: `activity-practice-${gap.requirementId}`,
        title: `Practice: ${gap.requirementTitle}`,
        description: `Strengthen your answer for "${gap.requirementTitle}" using your existing evidence.`,
        type: "practice_question",
        relatedRequirementId: gap.requirementId,
        relatedCompetency: gap.requirementTitle,
        exampleQuestion: `Give me an example of when you ${gap.requirementTitle.toLowerCase()}.`,
        targetImprovement: gap.requirementTitle,
        measurableGoal: "Deliver a STAR-structured answer scored 70 or higher.",
      });
    }

    // Domain competency study.
    if (domainIntelligence?.competencies) {
      for (const comp of domainIntelligence.competencies.slice(0, 3)) {
        activities.push({
          id: `activity-comp-${comp}`,
          title: `Study: ${comp}`,
          description: `Review domain competency: ${comp}.`,
          type: "concept_study",
          relatedCompetency: comp,
          exampleQuestion: `How have you applied ${comp} in your work?`,
          targetImprovement: comp,
          measurableGoal: `Explain ${comp} with a concrete work example.`,
        });
      }
    }

    // Mock interview activity.
    activities.push({
      id: "activity-mock-interview",
      title: "Run a mock interview",
      description: "Conduct a practice interview using the generated configuration.",
      type: "mock_interview",
      relatedCompetency: "interviewing",
      exampleQuestion: "Open with: Tell me about yourself.",
      targetImprovement: "Interview delivery",
      measurableGoal: "Complete one full mock interview session.",
    });

    return activities;
  }

  private buildStudyPriorities(gapAnalysis: GapAnalysis): string[] {
    return [
      ...gapAnalysis.missingEvidence.map((g) => g.requirementTitle),
      ...gapAnalysis.partialMatches.map((g) => `Improve: ${g.requirementTitle}`),
    ].slice(0, 8);
  }

  private buildQuestionsToAskEmployer(
    companyResearch: CompanyResearch | undefined,
    jda: JobDescriptionAnalysis,
  ): string[] {
    const questions: string[] = [
      "How does this role contribute to the company's top priorities?",
      "What does success look like in this role after six months?",
    ];
    if (companyResearch?.industry) {
      questions.push(`How is ${companyResearch.industry} shaping the company's strategy?`);
    }
    if (companyResearch?.recentDevelopments.length) {
      questions.push("I saw your recent development in X—how will that affect this team?");
    }
    if (jda.responsibilities.length) {
      questions.push("Which of the listed responsibilities is the most critical in the first 90 days?");
    }
    questions.push("What do you enjoy most about working here?");
    return questions.slice(0, 6);
  }

  private buildMockInterviewConfig(
    jda: JobDescriptionAnalysis,
    domainIntelligence?: PreparationPlanInput["domainIntelligence"],
  ): MockInterviewConfig {
    return {
      domain: domainIntelligence?.domain ?? jda.domain,
      interviewType: jda.seniority ?? "mixed",
      questionCount: 6,
    };
  }
}
