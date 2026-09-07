// core/candidate/CandidateContextBuilder.ts

import type { CandidateProfile } from "./CandidateProfile";

import type { ExperienceStore, CandidateExperience } from "./ExperienceStore";

import type { ProjectStore, CandidateProject } from "./ProjectStore";

import type { SkillStore, CandidateSkill } from "./SkillStore";

import type { StoryStore, CandidateStory } from "./StoryStore";

import type { CandidateEvidence, EvidenceValidator } from "./EvidenceValidator";

export interface CandidateContext {
  readonly candidateId: string;
  readonly evidence: readonly CandidateEvidence[];
  readonly text: string;
}

export interface CandidateContextBuilderOptions {
  readonly profile: CandidateProfile;
  readonly experiences: ExperienceStore;
  readonly projects: ProjectStore;
  readonly skills: SkillStore;
  readonly stories: StoryStore;
  readonly validator: EvidenceValidator;
}

export class CandidateContextBuilder {
  private readonly profile: CandidateProfile;
  private readonly experiences: ExperienceStore;
  private readonly projects: ProjectStore;
  private readonly skills: SkillStore;
  private readonly stories: StoryStore;
  private readonly validator: EvidenceValidator;

  public constructor(options: CandidateContextBuilderOptions) {
    this.profile = options.profile;
    this.experiences = options.experiences;
    this.projects = options.projects;
    this.skills = options.skills;
    this.stories = options.stories;
    this.validator = options.validator;
  }

  public async build(): Promise<CandidateContext> {
    const [experiences, projects, skills, stories] = await Promise.all([
      this.experiences.list(this.profile.id),
      this.projects.list(this.profile.id),
      this.skills.list(this.profile.id),
      this.stories.list(this.profile.id),
    ]);

    const evidence = [
      ...this.profileEvidence(),
      ...experiences.map((item) => this.experienceEvidence(item)),
      ...projects.map((item) => this.projectEvidence(item)),
      ...skills.map((item) => this.skillEvidence(item)),
      ...stories.map((item) => this.storyEvidence(item)),
    ];

    const validation = this.validator.validateCollection(evidence);

    if (!validation.valid) {
      throw new Error(
        `Invalid candidate context: ${validation.reasons.join(" ")}`,
      );
    }

    const text = evidence
      .map((item) => `[${item.type.toUpperCase()}]\n${item.text}`)
      .join("\n\n");

    return {
      candidateId: this.profile.id,
      evidence,
      text,
    };
  }

  private profileEvidence(): CandidateEvidence[] {
    const parts = [
      this.profile.headline,
      this.profile.summary,
      this.profile.education
        .map(
          (education) =>
            `${education.degree ?? ""} ${
              education.fieldOfStudy ?? ""
            } at ${education.institution}`,
        )
        .join("; "),
      this.profile.certifications
        .map(
          (certification) =>
            `${certification.name} ${
              certification.issuer ? `(${certification.issuer})` : ""
            }`,
        )
        .join("; "),
    ].filter(Boolean);

    if (parts.length === 0) {
      return [];
    }

    return [
      {
        id: `${this.profile.id}:profile`,
        candidateId: this.profile.id,
        type: "resume",
        text: parts.join("\n"),
        sourceName: "Candidate Profile",
        verified: true,
        confidence: 0.95,
      },
    ];
  }

  private experienceEvidence(
    experience: CandidateExperience,
  ): CandidateEvidence {
    return {
      id: `experience:${experience.id}`,
      candidateId: experience.candidateId,
      type: "experience",
      sourceId: experience.id,
      sourceName: experience.company,
      verified: true,
      confidence: 0.95,
      text: [
        `${experience.title} at ${experience.company}`,
        experience.description,
        experience.achievements.length
          ? `Achievements: ${experience.achievements.join("; ")}`
          : "",
        experience.technologies.length
          ? `Technologies: ${experience.technologies.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  private projectEvidence(project: CandidateProject): CandidateEvidence {
    return {
      id: `project:${project.id}`,
      candidateId: project.candidateId,
      type: "project",
      sourceId: project.id,
      sourceName: project.name,
      verified: true,
      confidence: 0.95,
      text: [
        `Project: ${project.name}`,
        project.description,
        project.role ? `Role: ${project.role}` : "",
        project.technologies.length
          ? `Technologies: ${project.technologies.join(", ")}`
          : "",
        project.responsibilities.length
          ? `Responsibilities: ${project.responsibilities.join("; ")}`
          : "",
        project.achievements.length
          ? `Achievements: ${project.achievements.join("; ")}`
          : "",
        project.challenges.length
          ? `Challenges: ${project.challenges.join("; ")}`
          : "",
        project.solutions.length
          ? `Solutions: ${project.solutions.join("; ")}`
          : "",
        project.outcomes.length
          ? `Outcomes: ${project.outcomes.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  private skillEvidence(skill: CandidateSkill): CandidateEvidence {
    return {
      id: `skill:${skill.id}`,
      candidateId: skill.candidateId,
      type: "skill",
      sourceId: skill.id,
      sourceName: skill.name,
      verified: true,
      confidence: 0.85,
      text: [
        `Skill: ${skill.name}`,
        skill.category ? `Category: ${skill.category}` : "",
        skill.level ? `Level: ${skill.level}` : "",
        skill.yearsOfExperience !== undefined
          ? `Years of experience: ${skill.yearsOfExperience}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  private storyEvidence(story: CandidateStory): CandidateEvidence {
    return {
      id: `story:${story.id}`,
      candidateId: story.candidateId,
      type: "story",
      sourceId: story.id,
      sourceName: story.title,
      verified: story.verified,
      confidence: story.verified ? 0.98 : 0.75,
      text: [
        `Story: ${story.title}`,
        `Situation: ${story.situation}`,
        `Task: ${story.task}`,
        `Action: ${story.action}`,
        `Result: ${story.result}`,
        story.skills.length ? `Skills: ${story.skills.join(", ")}` : "",
        story.topics.length ? `Topics: ${story.topics.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
}