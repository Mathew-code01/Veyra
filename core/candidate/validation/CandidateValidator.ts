// ============================================================================
// FILE: core/candidate/validation/CandidateValidator.ts
// PURPOSE:
// Canonical runtime validation for candidate-domain records.
//
// IMPORTANT:
// TypeScript types disappear at runtime. Candidate data may eventually come
// from persisted storage, imported documents, IPC, APIs, or user input.
// Therefore these rules must remain runtime-safe.
// ============================================================================

import {
  CandidateError,
  type CandidateErrorDetails,
} from "../errors/CandidateError";

import type {
  CandidateExperience,
  CandidateId,
  CandidateProfile,
  CandidateProject,
  CandidateSkill,
  CandidateStory,
  CertificationRecord,
  EducationRecord,
  SkillLevel,
} from "../contracts/CandidateTypes";

import type {
  CandidateEvidence,
  CandidateEvidenceType,
  EvidenceValidationResult,
} from "../contracts/CandidateEvidence";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CANDIDATE_ID_MAX_LENGTH = 256;
const RECORD_ID_MAX_LENGTH = 256;

const SKILL_LEVELS: readonly SkillLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

const EVIDENCE_TYPES: readonly CandidateEvidenceType[] = [
  "resume",
  "experience",
  "project",
  "skill",
  "story",
  "education",
  "certification",
];

function isValidDateString(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed);
}

function assertDateOrdering(
  startDate: string | undefined,
  endDate: string | undefined,
  fieldPrefix: string,
  details: CandidateErrorDetails,
): void {
  if (startDate === undefined || endDate === undefined) {
    return;
  }

  const start = Date.parse(startDate);
  const end = Date.parse(endDate);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return;
  }

  if (end < start) {
    throw CandidateError.invalidRequest(
      `${fieldPrefix} endDate cannot be earlier than startDate.`,
      details,
    );
  }
}

function requireNonEmpty(
  value: string,
  field: string,
  details: CandidateErrorDetails,
): void {
  if (!value.trim()) {
    throw CandidateError.invalidRequest(`${field} is required.`, details);
  }
}

function validateIdentifier(
  value: string,
  field: string,
  maxLength: number,
  details: CandidateErrorDetails,
): void {
  requireNonEmpty(value, field, details);

  if (value.trim().length > maxLength) {
    throw CandidateError.invalidRequest(
      `${field} cannot exceed ${maxLength} characters.`,
      details,
    );
  }
}

function validateOptionalDate(
  value: string | undefined,
  field: string,
  details: CandidateErrorDetails,
): void {
  if (value !== undefined && !isValidDateString(value)) {
    throw CandidateError.invalidRequest(
      `${field} must be a valid date.`,
      details,
    );
  }
}

function validateStringArray(
  values: readonly string[],
  field: string,
  details: CandidateErrorDetails,
): void {
  for (const value of values) {
    if (!value.trim()) {
      throw CandidateError.invalidRequest(
        `${field} cannot contain empty values.`,
        details,
      );
    }
  }
}

function validateUniqueStringArray(
  values: readonly string[],
  field: string,
  details: CandidateErrorDetails,
): void {
  validateStringArray(values, field, details);

  const normalized = values.map((value) => value.trim().toLowerCase());

  if (new Set(normalized).size !== normalized.length) {
    throw CandidateError.invalidRequest(
      `${field} cannot contain duplicate values.`,
      details,
    );
  }
}

function validateHttpUrl(
  value: string,
  field: string,
  details: CandidateErrorDetails,
): void {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol.");
    }
  } catch {
    throw CandidateError.invalidRequest(
      `${field} must be a valid HTTP(S) URL.`,
      details,
    );
  }
}

function validateEducation(
  education: EducationRecord,
  candidateId: CandidateId,
): void {
  const details = {
    stage: "profile" as const,
    candidateId,
  };

  requireNonEmpty(education.institution, "Education institution", details);

  validateOptionalDate(education.startDate, "Education startDate", details);

  validateOptionalDate(education.endDate, "Education endDate", details);

  assertDateOrdering(
    education.startDate,
    education.endDate,
    "Education",
    details,
  );
}

function validateCertification(
  certification: CertificationRecord,
  candidateId: CandidateId,
): void {
  const details = {
    stage: "profile" as const,
    candidateId,
  };

  requireNonEmpty(certification.name, "Certification name", details);

  validateOptionalDate(
    certification.issueDate,
    "Certification issueDate",
    details,
  );

  validateOptionalDate(
    certification.expiryDate,
    "Certification expiryDate",
    details,
  );

  assertDateOrdering(
    certification.issueDate,
    certification.expiryDate,
    "Certification",
    details,
  );
}

function isSkillLevel(value: unknown): value is SkillLevel {
  return (
    typeof value === "string" && SKILL_LEVELS.includes(value as SkillLevel)
  );
}

function isEvidenceType(value: unknown): value is CandidateEvidenceType {
  return (
    typeof value === "string" &&
    EVIDENCE_TYPES.includes(value as CandidateEvidenceType)
  );
}

export class CandidateValidator {
  public validateCandidateId(candidateId: string): void {
    if (typeof candidateId !== "string") {
      throw CandidateError.invalidRequest("Candidate id must be a string.");
    }

    validateIdentifier(candidateId, "Candidate id", CANDIDATE_ID_MAX_LENGTH, {
      stage: "validation",
    });
  }

  public validateProfile(profile: CandidateProfile): void {
    const details = {
      stage: "profile" as const,
      candidateId: profile.id,
    };

    if (!profile || typeof profile !== "object") {
      throw CandidateError.invalidRequest(
        "Candidate profile is required.",
        details,
      );
    }

    validateIdentifier(
      profile.id,
      "Candidate id",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );

    requireNonEmpty(profile.fullName, "Candidate full name", details);

    if (profile.email !== undefined && !EMAIL_PATTERN.test(profile.email)) {
      throw CandidateError.invalidRequest(
        "Candidate email is invalid.",
        details,
      );
    }

    for (const education of profile.education) {
      validateEducation(education, profile.id);
    }

    for (const certification of profile.certifications) {
      validateCertification(certification, profile.id);
    }

    if (!isValidDateString(profile.createdAt)) {
      throw CandidateError.invalidRequest(
        "Candidate createdAt must be a valid date.",
        details,
      );
    }

    if (!isValidDateString(profile.updatedAt)) {
      throw CandidateError.invalidRequest(
        "Candidate updatedAt must be a valid date.",
        details,
      );
    }

    if (Date.parse(profile.updatedAt) < Date.parse(profile.createdAt)) {
      throw CandidateError.invalidRequest(
        "Candidate updatedAt cannot be earlier than createdAt.",
        details,
      );
    }
  }

  public validateExperience(experience: CandidateExperience): void {
    const details = {
      stage: "experience" as const,
      candidateId: experience.candidateId,
      recordId: experience.id,
    };

    validateIdentifier(
      experience.id,
      "Experience id",
      RECORD_ID_MAX_LENGTH,
      details,
    );

    validateIdentifier(
      experience.candidateId,
      "Experience candidateId",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );

    requireNonEmpty(experience.company, "Experience company", details);
    requireNonEmpty(experience.title, "Experience title", details);

    validateOptionalDate(experience.startDate, "Experience startDate", details);

    validateOptionalDate(experience.endDate, "Experience endDate", details);

    assertDateOrdering(
      experience.startDate,
      experience.endDate,
      "Experience",
      details,
    );

    validateStringArray(
      experience.achievements,
      "Experience achievements",
      details,
    );

    validateUniqueStringArray(
      experience.technologies,
      "Experience technologies",
      details,
    );

    if (experience.current === true && experience.endDate !== undefined) {
      throw CandidateError.invalidRequest(
        "Current experience cannot have an endDate.",
        details,
      );
    }
  }

  public validateProject(project: CandidateProject): void {
    const details = {
      stage: "project" as const,
      candidateId: project.candidateId,
      recordId: project.id,
    };

    validateIdentifier(project.id, "Project id", RECORD_ID_MAX_LENGTH, details);

    validateIdentifier(
      project.candidateId,
      "Project candidateId",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );

    requireNonEmpty(project.name, "Project name", details);
    requireNonEmpty(project.description, "Project description", details);

    validateUniqueStringArray(
      project.technologies,
      "Project technologies",
      details,
    );

    validateStringArray(
      project.responsibilities,
      "Project responsibilities",
      details,
    );

    validateStringArray(project.achievements, "Project achievements", details);

    validateStringArray(project.challenges, "Project challenges", details);

    validateStringArray(project.solutions, "Project solutions", details);

    validateStringArray(project.outcomes, "Project outcomes", details);

    validateOptionalDate(project.startDate, "Project startDate", details);

    validateOptionalDate(project.endDate, "Project endDate", details);

    assertDateOrdering(project.startDate, project.endDate, "Project", details);

    if (project.repositoryUrl !== undefined) {
      validateHttpUrl(project.repositoryUrl, "Project repositoryUrl", details);
    }

    if (project.liveUrl !== undefined) {
      validateHttpUrl(project.liveUrl, "Project liveUrl", details);
    }
  }

  public validateSkill(skill: CandidateSkill): void {
    const details = {
      stage: "skill" as const,
      candidateId: skill.candidateId,
      recordId: skill.id,
    };

    validateIdentifier(skill.id, "Skill id", RECORD_ID_MAX_LENGTH, details);

    validateIdentifier(
      skill.candidateId,
      "Skill candidateId",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );

    requireNonEmpty(skill.name, "Skill name", details);

    if (skill.level !== undefined && !isSkillLevel(skill.level)) {
      throw CandidateError.invalidRequest("Skill level is invalid.", details);
    }

    if (
      skill.yearsOfExperience !== undefined &&
      (!Number.isFinite(skill.yearsOfExperience) ||
        skill.yearsOfExperience < 0 ||
        skill.yearsOfExperience > 100)
    ) {
      throw CandidateError.invalidRequest(
        "Skill yearsOfExperience must be a finite number between 0 and 100.",
        details,
      );
    }

    validateUniqueStringArray(skill.evidenceIds, "Skill evidenceIds", details);
  }

  public validateStory(story: CandidateStory): void {
    const details = {
      stage: "story" as const,
      candidateId: story.candidateId,
      recordId: story.id,
    };

    validateIdentifier(story.id, "Story id", RECORD_ID_MAX_LENGTH, details);

    validateIdentifier(
      story.candidateId,
      "Story candidateId",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );

    requireNonEmpty(story.title, "Story title", details);
    requireNonEmpty(story.situation, "Story situation", details);
    requireNonEmpty(story.task, "Story task", details);
    requireNonEmpty(story.action, "Story action", details);
    requireNonEmpty(story.result, "Story result", details);

    validateUniqueStringArray(story.skills, "Story skills", details);
    validateUniqueStringArray(story.topics, "Story topics", details);
  }

  public validateEvidence(
    evidence: CandidateEvidence,
  ): EvidenceValidationResult {
    const reasons: string[] = [];

    if (!evidence || typeof evidence !== "object") {
      return {
        valid: false,
        confidence: 0,
        reasons: ["Evidence record is missing."],
      };
    }

    if (!evidence.id.trim()) {
      reasons.push("Evidence id is missing.");
    }

    if (!evidence.candidateId.trim()) {
      reasons.push("Evidence candidateId is missing.");
    }

    if (!isEvidenceType(evidence.type)) {
      reasons.push("Evidence type is invalid.");
    }

    if (!evidence.text.trim()) {
      reasons.push("Evidence text is empty.");
    }

    if (
      !Number.isFinite(evidence.confidence) ||
      evidence.confidence < 0 ||
      evidence.confidence > 1
    ) {
      reasons.push("Evidence confidence must be between 0 and 1.");
    }

    const valid = reasons.length === 0;

    return {
      valid,
      confidence: valid
        ? evidence.verified
          ? Math.max(evidence.confidence, 0.9)
          : evidence.confidence
        : 0,
      reasons,
    };
  }

  public validateEvidenceCollection(
    evidence: readonly CandidateEvidence[],
  ): EvidenceValidationResult {
    if (evidence.length === 0) {
      return {
        valid: false,
        confidence: 0,
        reasons: ["No candidate evidence was supplied."],
      };
    }

    const results = evidence.map((item) => this.validateEvidence(item));

    const valid = results.every((result) => result.valid);

    const confidence =
      results.reduce((sum, result) => sum + result.confidence, 0) /
      results.length;

    const ids = evidence.map((item) => item.id.trim());

    if (new Set(ids).size !== ids.length) {
      return {
        valid: false,
        confidence,
        reasons: [
          ...results.flatMap((result) => result.reasons),
          "Candidate evidence contains duplicate ids.",
        ],
      };
    }

    return {
      valid,
      confidence,
      reasons: results.flatMap((result) => result.reasons),
    };
  }

  public validateRecordOwnership(
    candidateId: string,
    recordCandidateId: string,
    stage: CandidateErrorDetails["stage"],
    recordId?: string,
  ): void {
    if (candidateId.trim() !== recordCandidateId.trim()) {
      throw CandidateError.conflict(
        "Candidate record belongs to a different candidate.",
        {
          stage,
          candidateId: candidateId.trim(),
          recordId,
        },
      );
    }
  }
}
