// ============================================================================
// FILE: core/candidate/services/CandidateContextBuilder.ts
// PURPOSE:
// Builds a deterministic CandidateContext from candidate-domain records.
//
// IMPORTANT:
// This service does NOT:
// - call an LLM
// - call AIManager
// - call ContextManager
// - perform embeddings
// - perform semantic retrieval
// - generate interview answers
//
// Its responsibility is only to transform structured candidate records into
// normalized candidate evidence and a readable candidate context.
// ============================================================================

import type { CandidateContext } from "../contracts/CandidateContext";

import type { CandidateEvidence } from "../contracts/CandidateEvidence";

import type {
  CandidateExperience,
  CandidateProfile,
  CandidateProject,
  CandidateSkill,
  CandidateStory,
} from "../contracts/CandidateTypes";

import { CandidateError } from "../errors/CandidateError";

import { CandidateValidator } from "../validation/CandidateValidator";

import type { CandidateProfileStore } from "../stores/CandidateProfileStore";
import type { ExperienceStore } from "../stores/ExperienceStore";
import type { ProjectStore } from "../stores/ProjectStore";
import type { SkillStore } from "../stores/SkillStore";
import type { StoryStore } from "../stores/StoryStore";

export interface CandidateContextBuilderOptions {
  readonly profileStore: CandidateProfileStore;
  readonly experienceStore: ExperienceStore;
  readonly projectStore: ProjectStore;
  readonly skillStore: SkillStore;
  readonly storyStore: StoryStore;

  readonly validator?: CandidateValidator;
}

export interface BuildCandidateContextRequest {
  readonly candidateId: string;

  /**
   * Optional cancellation support.
   */
  readonly signal?: AbortSignal;
}

export class CandidateContextBuilder {
  private readonly profileStore: CandidateProfileStore;

  private readonly experienceStore: ExperienceStore;

  private readonly projectStore: ProjectStore;

  private readonly skillStore: SkillStore;

  private readonly storyStore: StoryStore;

  private readonly validator: CandidateValidator;

  public constructor(options: CandidateContextBuilderOptions) {
    this.profileStore = options.profileStore;
    this.experienceStore = options.experienceStore;
    this.projectStore = options.projectStore;
    this.skillStore = options.skillStore;
    this.storyStore = options.storyStore;

    this.validator = options.validator ?? new CandidateValidator();
  }

  public async build(
    request: BuildCandidateContextRequest,
  ): Promise<CandidateContext> {
    this.validator.validateCandidateId(request.candidateId);

    const candidateId = request.candidateId.trim();

    this.throwIfCancelled(request.signal, candidateId);

    try {
      const [profile, experiences, projects, skills, stories] =
        await Promise.all([
          this.profileStore.get(candidateId),
          this.experienceStore.list(candidateId),
          this.projectStore.list(candidateId),
          this.skillStore.list(candidateId),
          this.storyStore.list(candidateId),
        ]);

      this.throwIfCancelled(request.signal, candidateId);

      if (profile === undefined) {
        throw CandidateError.notFound(
          `Candidate profile '${candidateId}' was not found.`,
          {
            stage: "profile",
            candidateId,
          },
        );
      }

      this.validateRecords(profile, experiences, projects, skills, stories);

      const evidence = this.buildEvidence(
        profile,
        experiences,
        projects,
        skills,
        stories,
      );

      const validation = this.validator.validateEvidenceCollection(evidence);

      if (!validation.valid) {
        throw CandidateError.contextBuildFailure(
          "Candidate context contains invalid evidence.",
          {
            candidateId,
            reasons: validation.reasons,
          },
        );
      }

      const text = this.buildText(
        profile,
        experiences,
        projects,
        skills,
        stories,
      );

      if (!text.trim()) {
        throw CandidateError.contextBuildFailure(
          "Candidate context produced empty text.",
          {
            candidateId,
          },
        );
      }

      return Object.freeze({
        candidateId,
        evidence: Object.freeze(evidence),
        text,
        generatedAt: new Date().toISOString(),
        metadata: Object.freeze({
          evidenceCount: evidence.length,
          experienceCount: experiences.length,
          projectCount: projects.length,
          skillCount: skills.length,
          storyCount: stories.length,
        }),
      });
    } catch (error) {
      if (error instanceof CandidateError) {
        throw error;
      }

      throw CandidateError.contextBuildFailure(
        "Failed to build candidate context.",
        {
          candidateId,
          cause: error,
        },
      );
    }
  }

  private validateRecords(
    profile: CandidateProfile,
    experiences: readonly CandidateExperience[],
    projects: readonly CandidateProject[],
    skills: readonly CandidateSkill[],
    stories: readonly CandidateStory[],
  ): void {
    this.validator.validateProfile(profile);

    for (const experience of experiences) {
      this.validator.validateExperience(experience);

      this.validator.validateRecordOwnership(
        profile.id,
        experience.candidateId,
        "experience",
        experience.id,
      );
    }

    for (const project of projects) {
      this.validator.validateProject(project);

      this.validator.validateRecordOwnership(
        profile.id,
        project.candidateId,
        "project",
        project.id,
      );
    }

    for (const skill of skills) {
      this.validator.validateSkill(skill);

      this.validator.validateRecordOwnership(
        profile.id,
        skill.candidateId,
        "skill",
        skill.id,
      );
    }

    for (const story of stories) {
      this.validator.validateStory(story);

      this.validator.validateRecordOwnership(
        profile.id,
        story.candidateId,
        "story",
        story.id,
      );
    }
  }

  private buildEvidence(
    profile: CandidateProfile,
    experiences: readonly CandidateExperience[],
    projects: readonly CandidateProject[],
    skills: readonly CandidateSkill[],
    stories: readonly CandidateStory[],
  ): readonly CandidateEvidence[] {
    const evidence: CandidateEvidence[] = [];

    const profileText = this.buildProfileText(profile);

    if (profileText) {
      evidence.push(
        this.createEvidence({
          id: `profile:${profile.id}`,
          candidateId: profile.id,
          type: "resume",
          text: profileText,
          verified: false,
          confidence: 0.8,
          metadata: {
            source: "candidate_profile",
          },
        }),
      );
    }

    for (const experience of experiences) {
      evidence.push(
        this.createEvidence({
          id: `experience:${experience.id}`,
          candidateId: experience.candidateId,
          type: "experience",
          text: this.formatExperience(experience),
          verified: false,
          confidence: 0.8,
          metadata: {
            source: "candidate_experience",
            recordId: experience.id,
          },
        }),
      );
    }

    for (const project of projects) {
      evidence.push(
        this.createEvidence({
          id: `project:${project.id}`,
          candidateId: project.candidateId,
          type: "project",
          text: this.formatProject(project),
          verified: false,
          confidence: 0.8,
          metadata: {
            source: "candidate_project",
            recordId: project.id,
          },
        }),
      );
    }

    for (const skill of skills) {
      evidence.push(
        this.createEvidence({
          id: `skill:${skill.id}`,
          candidateId: skill.candidateId,
          type: "skill",
          text: this.formatSkill(skill),
          verified: false,
          confidence: 0.75,
          metadata: {
            source: "candidate_skill",
            recordId: skill.id,
            evidenceIds: [...skill.evidenceIds],
          },
        }),
      );
    }

    for (const story of stories) {
      evidence.push(
        this.createEvidence({
          id: `story:${story.id}`,
          candidateId: story.candidateId,
          type: "story",
          text: this.formatStory(story),
          verified: story.verified,
          confidence: story.verified ? 0.95 : 0.75,
          sourceName: story.source,
          metadata: {
            source: "candidate_story",
            recordId: story.id,
          },
        }),
      );
    }

    return Object.freeze(evidence);
  }

  private createEvidence(
    input: Omit<CandidateEvidence, "metadata"> & {
      readonly metadata?: Readonly<Record<string, unknown>>;
    },
  ): CandidateEvidence {
    return Object.freeze({
      ...input,
      metadata:
        input.metadata === undefined
          ? undefined
          : Object.freeze({
              ...input.metadata,
            }),
    });
  }

  private buildText(
    profile: CandidateProfile,
    experiences: readonly CandidateExperience[],
    projects: readonly CandidateProject[],
    skills: readonly CandidateSkill[],
    stories: readonly CandidateStory[],
  ): string {
    const sections: string[] = [];

    sections.push(
      "CANDIDATE FACTS",
      "The following information represents candidate-domain records. Do not invent unsupported candidate experience.",
      "",
    );

    const profileText = this.buildProfileText(profile);

    if (profileText) {
      sections.push("PROFILE", profileText, "");
    }

    if (experiences.length > 0) {
      sections.push("EXPERIENCE");

      for (const experience of experiences) {
        sections.push(this.formatExperience(experience), "");
      }
    }

    if (projects.length > 0) {
      sections.push("PROJECTS");

      for (const project of projects) {
        sections.push(this.formatProject(project), "");
      }
    }

    if (skills.length > 0) {
      sections.push("SKILLS");

      for (const skill of skills) {
        sections.push(this.formatSkill(skill), "");
      }
    }

    if (stories.length > 0) {
      sections.push("STORIES");

      for (const story of stories) {
        sections.push(this.formatStory(story), "");
      }
    }

    return sections.join("\n").trim();
  }

  private buildProfileText(profile: CandidateProfile): string {
    const lines: string[] = [];

    lines.push(`Name: ${profile.fullName}`);

    if (profile.headline) {
      lines.push(`Headline: ${profile.headline}`);
    }

    if (profile.summary) {
      lines.push(`Summary: ${profile.summary}`);
    }

    if (profile.location) {
      lines.push(`Location: ${profile.location}`);
    }

    if (profile.education.length > 0) {
      lines.push("Education:");

      for (const education of profile.education) {
        const parts = [education.institution];

        if (education.degree) {
          parts.push(education.degree);
        }

        if (education.fieldOfStudy) {
          parts.push(education.fieldOfStudy);
        }

        if (education.startDate || education.endDate) {
          parts.push(
            `${education.startDate ?? "unknown"} - ${
              education.endDate ?? "present"
            }`,
          );
        }

        lines.push(`- ${parts.join(" | ")}`);

        if (education.description) {
          lines.push(`  ${education.description}`);
        }
      }
    }

    if (profile.certifications.length > 0) {
      lines.push("Certifications:");

      for (const certification of profile.certifications) {
        const parts = [certification.name];

        if (certification.issuer) {
          parts.push(certification.issuer);
        }

        if (certification.issueDate) {
          parts.push(`Issued ${certification.issueDate}`);
        }

        if (certification.expiryDate) {
          parts.push(`Expires ${certification.expiryDate}`);
        }

        lines.push(`- ${parts.join(" | ")}`);
      }
    }

    return lines.join("\n").trim();
  }

  private formatExperience(experience: CandidateExperience): string {
    const lines: string[] = [];

    lines.push(`${experience.title} at ${experience.company}`);

    if (experience.location) {
      lines.push(`Location: ${experience.location}`);
    }

    if (experience.startDate || experience.endDate || experience.current) {
      lines.push(
        `Period: ${experience.startDate ?? "unknown"} - ${
          experience.current ? "present" : (experience.endDate ?? "unknown")
        }`,
      );
    }

    if (experience.description) {
      lines.push(`Description: ${experience.description}`);
    }

    if (experience.technologies.length > 0) {
      lines.push(`Technologies: ${experience.technologies.join(", ")}`);
    }

    if (experience.achievements.length > 0) {
      lines.push("Achievements:");

      for (const achievement of experience.achievements) {
        lines.push(`- ${achievement}`);
      }
    }

    return lines.join("\n").trim();
  }

  private formatProject(project: CandidateProject): string {
    const lines: string[] = [];

    lines.push(project.name);

    if (project.role) {
      lines.push(`Role: ${project.role}`);
    }

    lines.push(`Description: ${project.description}`);

    if (project.technologies.length > 0) {
      lines.push(`Technologies: ${project.technologies.join(", ")}`);
    }

    if (project.responsibilities.length > 0) {
      lines.push("Responsibilities:");

      for (const responsibility of project.responsibilities) {
        lines.push(`- ${responsibility}`);
      }
    }

    if (project.achievements.length > 0) {
      lines.push("Achievements:");

      for (const achievement of project.achievements) {
        lines.push(`- ${achievement}`);
      }
    }

    if (project.challenges.length > 0) {
      lines.push("Challenges:");

      for (const challenge of project.challenges) {
        lines.push(`- ${challenge}`);
      }
    }

    if (project.solutions.length > 0) {
      lines.push("Solutions:");

      for (const solution of project.solutions) {
        lines.push(`- ${solution}`);
      }
    }

    if (project.outcomes.length > 0) {
      lines.push("Outcomes:");

      for (const outcome of project.outcomes) {
        lines.push(`- ${outcome}`);
      }
    }

    return lines.join("\n").trim();
  }

  private formatSkill(skill: CandidateSkill): string {
    const parts = [skill.name];

    if (skill.category) {
      parts.push(`Category: ${skill.category}`);
    }

    if (skill.level) {
      parts.push(`Level: ${skill.level}`);
    }

    if (skill.yearsOfExperience !== undefined) {
      parts.push(`Years of experience: ${skill.yearsOfExperience}`);
    }

    return parts.join(" | ");
  }

  private formatStory(story: CandidateStory): string {
    const lines: string[] = [];

    lines.push(`Story: ${story.title}`);
    lines.push(`Situation: ${story.situation}`);
    lines.push(`Task: ${story.task}`);
    lines.push(`Action: ${story.action}`);
    lines.push(`Result: ${story.result}`);

    if (story.skills.length > 0) {
      lines.push(`Skills: ${story.skills.join(", ")}`);
    }

    if (story.topics.length > 0) {
      lines.push(`Topics: ${story.topics.join(", ")}`);
    }

    return lines.join("\n").trim();
  }

  private throwIfCancelled(
    signal: AbortSignal | undefined,
    candidateId: string,
  ): void {
    if (signal?.aborted) {
      throw CandidateError.cancelled(candidateId);
    }
  }
}
