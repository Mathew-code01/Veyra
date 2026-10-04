// ============================================================================
// FILE: core/candidate/validation/CandidateValidator.ts
// PURPOSE:
// Canonical runtime validation for candidate-domain records.
//
// IMPORTANT:
// TypeScript types disappear at runtime. Candidate data may come from
// persistence, imported documents, IPC, APIs, or user input. Every public
// validator therefore guards object/array/string boundaries before accessing
// nested fields.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidDateString(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function assertDateOrdering(
  startDate: string | undefined,
  endDate: string | undefined,
  fieldPrefix: string,
  details: CandidateErrorDetails,
): void {
  if (startDate === undefined || endDate === undefined) return;

  const start = Date.parse(startDate);
  const end = Date.parse(endDate);

  if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
    throw CandidateError.invalidRequest(
      `${fieldPrefix} endDate cannot be earlier than startDate.`,
      details,
    );
  }
}

function requireNonEmpty(
  value: unknown,
  field: string,
  details: CandidateErrorDetails,
): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw CandidateError.invalidRequest(`${field} is required.`, details);
  }
}

function validateIdentifier(
  value: unknown,
  field: string,
  maxLength: number,
  details: CandidateErrorDetails,
): asserts value is string {
  requireNonEmpty(value, field, details);

  if (value.trim().length > maxLength) {
    throw CandidateError.invalidRequest(
      `${field} cannot exceed ${maxLength} characters.`,
      details,
    );
  }
}

function validateOptionalString(
  value: unknown,
  field: string,
  details: CandidateErrorDetails,
): void {
  if (value !== undefined && typeof value !== "string") {
    throw CandidateError.invalidRequest(`${field} must be a string.`, details);
  }
}

function validateOptionalDate(
  value: unknown,
  field: string,
  details: CandidateErrorDetails,
): void {
  if (value !== undefined) {
    requireNonEmpty(value, field, details);
    if (!isValidDateString(value)) {
      throw CandidateError.invalidRequest(
        `${field} must be a valid date.`,
        details,
      );
    }
  }
}

function validateStringArray(
  values: unknown,
  field: string,
  details: CandidateErrorDetails,
): asserts values is readonly string[] {
  if (!Array.isArray(values)) {
    throw CandidateError.invalidRequest(`${field} must be an array.`, details);
  }

  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) {
      throw CandidateError.invalidRequest(
        `${field} cannot contain empty values.`,
        details,
      );
    }
  }
}

function validateUniqueStringArray(
  values: unknown,
  field: string,
  details: CandidateErrorDetails,
): asserts values is readonly string[] {
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
  value: unknown,
  field: string,
  details: CandidateErrorDetails,
): void {
  requireNonEmpty(value, field, details);

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
  education: unknown,
  candidateId: CandidateId,
): asserts education is EducationRecord {
  const details = { stage: "profile" as const, candidateId };

  if (!isRecord(education)) {
    throw CandidateError.invalidRequest(
      "Education record is required.",
      details,
    );
  }

  requireNonEmpty(education.institution, "Education institution", details);
  validateOptionalString(education.degree, "Education degree", details);
  validateOptionalString(
    education.fieldOfStudy,
    "Education fieldOfStudy",
    details,
  );
  validateOptionalString(
    education.description,
    "Education description",
    details,
  );

  validateOptionalDate(education.startDate, "Education startDate", details);
  validateOptionalDate(education.endDate, "Education endDate", details);

  assertDateOrdering(
    education.startDate as string | undefined,
    education.endDate as string | undefined,
    "Education",
    details,
  );
}

function validateCertification(
  certification: unknown,
  candidateId: CandidateId,
): asserts certification is CertificationRecord {
  const details = { stage: "profile" as const, candidateId };

  if (!isRecord(certification)) {
    throw CandidateError.invalidRequest(
      "Certification record is required.",
      details,
    );
  }

  requireNonEmpty(certification.name, "Certification name", details);
  validateOptionalString(certification.issuer, "Certification issuer", details);
  validateOptionalString(
    certification.credentialId,
    "Certification credentialId",
    details,
  );

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
    certification.issueDate as string | undefined,
    certification.expiryDate as string | undefined,
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
  public validateCandidateId(
    candidateId: unknown,
  ): asserts candidateId is string {
    validateIdentifier(candidateId, "Candidate id", CANDIDATE_ID_MAX_LENGTH, {
      stage: "validation",
    });
  }

  public validateProfile(
    profile: unknown,
  ): asserts profile is CandidateProfile {
    if (!isRecord(profile)) {
      throw CandidateError.invalidRequest("Candidate profile is required.", {
        stage: "profile",
      });
    }

    const details = {
      stage: "profile" as const,
      candidateId:
        typeof profile.id === "string" ? profile.id.trim() : undefined,
    };

    validateIdentifier(
      profile.id,
      "Candidate id",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );
    requireNonEmpty(profile.fullName, "Candidate full name", details);

    validateOptionalString(profile.headline, "Candidate headline", details);
    validateOptionalString(profile.summary, "Candidate summary", details);
    validateOptionalString(profile.location, "Candidate location", details);
    validateOptionalString(profile.email, "Candidate email", details);
    validateOptionalString(
      profile.resumeDocumentId,
      "Candidate resumeDocumentId",
      details,
    );

    if (
      profile.email !== undefined &&
      (typeof profile.email !== "string" ||
        !EMAIL_PATTERN.test(profile.email.trim()))
    ) {
      throw CandidateError.invalidRequest(
        "Candidate email is invalid.",
        details,
      );
    }

    if (!Array.isArray(profile.education)) {
      throw CandidateError.invalidRequest(
        "Candidate education must be an array.",
        details,
      );
    }

    if (!Array.isArray(profile.certifications)) {
      throw CandidateError.invalidRequest(
        "Candidate certifications must be an array.",
        details,
      );
    }

    for (const education of profile.education) {
      validateEducation(education, profile.id);
    }

    for (const certification of profile.certifications) {
      validateCertification(certification, profile.id);
    }

    validateOptionalDate(profile.createdAt, "Candidate createdAt", details);
    validateOptionalDate(profile.updatedAt, "Candidate updatedAt", details);

    if (
      typeof profile.createdAt !== "string" ||
      typeof profile.updatedAt !== "string"
    ) {
      throw CandidateError.invalidRequest(
        "Candidate timestamps must be valid date strings.",
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

  public validateExperience(
    experience: unknown,
  ): asserts experience is CandidateExperience {
    if (!isRecord(experience)) {
      throw CandidateError.invalidRequest("Candidate experience is required.", {
        stage: "experience",
      });
    }

    const details = {
      stage: "experience" as const,
      candidateId:
        typeof experience.candidateId === "string"
          ? experience.candidateId.trim()
          : undefined,
      recordId:
        typeof experience.id === "string" ? experience.id.trim() : undefined,
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

    validateOptionalString(experience.location, "Experience location", details);
    validateOptionalString(
      experience.description,
      "Experience description",
      details,
    );

    validateOptionalDate(experience.startDate, "Experience startDate", details);
    validateOptionalDate(experience.endDate, "Experience endDate", details);

    assertDateOrdering(
      experience.startDate as string | undefined,
      experience.endDate as string | undefined,
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

    if (
      experience.current !== undefined &&
      typeof experience.current !== "boolean"
    ) {
      throw CandidateError.invalidRequest(
        "Experience current must be a boolean.",
        details,
      );
    }

    if (experience.current === true && experience.endDate !== undefined) {
      throw CandidateError.invalidRequest(
        "Current experience cannot have an endDate.",
        details,
      );
    }
  }

  public validateProject(
    project: unknown,
  ): asserts project is CandidateProject {
    if (!isRecord(project)) {
      throw CandidateError.invalidRequest("Candidate project is required.", {
        stage: "project",
      });
    }

    const details = {
      stage: "project" as const,
      candidateId:
        typeof project.candidateId === "string"
          ? project.candidateId.trim()
          : undefined,
      recordId: typeof project.id === "string" ? project.id.trim() : undefined,
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

    validateOptionalString(project.role, "Project role", details);
    validateOptionalDate(project.startDate, "Project startDate", details);
    validateOptionalDate(project.endDate, "Project endDate", details);

    assertDateOrdering(
      project.startDate as string | undefined,
      project.endDate as string | undefined,
      "Project",
      details,
    );

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

    if (project.repositoryUrl !== undefined) {
      validateHttpUrl(project.repositoryUrl, "Project repositoryUrl", details);
    }
    if (project.liveUrl !== undefined) {
      validateHttpUrl(project.liveUrl, "Project liveUrl", details);
    }
  }

  public validateSkill(skill: unknown): asserts skill is CandidateSkill {
    if (!isRecord(skill)) {
      throw CandidateError.invalidRequest("Candidate skill is required.", {
        stage: "skill",
      });
    }

    const details = {
      stage: "skill" as const,
      candidateId:
        typeof skill.candidateId === "string"
          ? skill.candidateId.trim()
          : undefined,
      recordId: typeof skill.id === "string" ? skill.id.trim() : undefined,
    };

    validateIdentifier(skill.id, "Skill id", RECORD_ID_MAX_LENGTH, details);
    validateIdentifier(
      skill.candidateId,
      "Skill candidateId",
      CANDIDATE_ID_MAX_LENGTH,
      details,
    );
    requireNonEmpty(skill.name, "Skill name", details);

    validateOptionalString(skill.category, "Skill category", details);

    if (skill.level !== undefined && !isSkillLevel(skill.level)) {
      throw CandidateError.invalidRequest("Skill level is invalid.", details);
    }

    if (
      skill.yearsOfExperience !== undefined &&
      (typeof skill.yearsOfExperience !== "number" ||
        !Number.isFinite(skill.yearsOfExperience) ||
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

  public validateStory(story: unknown): asserts story is CandidateStory {
    if (!isRecord(story)) {
      throw CandidateError.invalidRequest("Candidate story is required.", {
        stage: "story",
      });
    }

    const details = {
      stage: "story" as const,
      candidateId:
        typeof story.candidateId === "string"
          ? story.candidateId.trim()
          : undefined,
      recordId: typeof story.id === "string" ? story.id.trim() : undefined,
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

    if (typeof story.verified !== "boolean") {
      throw CandidateError.invalidRequest(
        "Story verified must be a boolean.",
        details,
      );
    }

    validateOptionalString(story.source, "Story source", details);
  }

  public validateEvidence(evidence: unknown): EvidenceValidationResult {
    const reasons: string[] = [];

    if (!isRecord(evidence)) {
      return {
        valid: false,
        confidence: 0,
        reasons: ["Evidence record is missing."],
      };
    }

    if (typeof evidence.id !== "string" || !evidence.id.trim()) {
      reasons.push("Evidence id is missing.");
    }

    if (
      typeof evidence.candidateId !== "string" ||
      !evidence.candidateId.trim()
    ) {
      reasons.push("Evidence candidateId is missing.");
    }

    if (!isEvidenceType(evidence.type)) {
      reasons.push("Evidence type is invalid.");
    }

    if (typeof evidence.text !== "string" || !evidence.text.trim()) {
      reasons.push("Evidence text is empty.");
    }

    if (typeof evidence.verified !== "boolean") {
      reasons.push("Evidence verified must be a boolean.");
    }

    if (
      typeof evidence.confidence !== "number" ||
      !Number.isFinite(evidence.confidence) ||
      evidence.confidence < 0 ||
      evidence.confidence > 1
    ) {
      reasons.push("Evidence confidence must be between 0 and 1.");
    }

    return {
      valid: reasons.length === 0,
      confidence:
        reasons.length === 0
          ? evidence.verified
            ? Math.max(evidence.confidence as number, 0.9)
            : (evidence.confidence as number)
          : 0,
      reasons,
    };
  }

  public validateEvidenceCollection(
    evidence: unknown,
  ): EvidenceValidationResult {
    if (!Array.isArray(evidence)) {
      return {
        valid: false,
        confidence: 0,
        reasons: ["Candidate evidence must be an array."],
      };
    }

    if (evidence.length === 0) {
      return {
        valid: false,
        confidence: 0,
        reasons: ["No candidate evidence was supplied."],
      };
    }

    const results = evidence.map((item) => this.validateEvidence(item));
    const ids = evidence.map((item) =>
      isRecord(item) && typeof item.id === "string" ? item.id.trim() : "",
    );

    const duplicateIds = new Set(ids).size !== ids.length;
    const reasons = results.flatMap((result) => result.reasons);

    if (duplicateIds) {
      reasons.push("Candidate evidence contains duplicate ids.");
    }

    return {
      valid: reasons.length === 0,
      confidence:
        results.length > 0
          ? results.reduce((sum, result) => sum + result.confidence, 0) /
            results.length
          : 0,
      reasons,
    };
  }

  public validateRecordOwnership(
    candidateId: string,
    recordCandidateId: string,
    stage: CandidateErrorDetails["stage"],
    recordId?: string,
  ): void {
    if (
      typeof candidateId !== "string" ||
      typeof recordCandidateId !== "string" ||
      candidateId.trim() !== recordCandidateId.trim()
    ) {
      throw CandidateError.conflict(
        "Candidate record belongs to a different candidate.",
        {
          stage,
          candidateId:
            typeof candidateId === "string" ? candidateId.trim() : undefined,
          recordId,
        },
      );
    }
  }
}
