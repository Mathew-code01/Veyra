// ============================================================================
// FILE: core/candidate/contracts/CandidateTypes.ts
// PURPOSE:
// Canonical domain contracts for candidate information.
//
// DESIGN PRINCIPLES:
// - Candidate data is domain-owned.
// - No AI, context, interview, conversation, or provider dependencies.
// - Data is immutable from the consumer's perspective.
// - Validation is handled by CandidateValidator.
// - Timestamps use ISO-8601 strings.
// ============================================================================

export type CandidateId = string;

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface EducationRecord {
  readonly institution: string;
  readonly degree?: string;
  readonly fieldOfStudy?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly description?: string;
}

export interface CertificationRecord {
  readonly name: string;
  readonly issuer?: string;
  readonly issueDate?: string;
  readonly expiryDate?: string;
  readonly credentialId?: string;
}

export interface CandidateProfile {
  readonly id: CandidateId;
  readonly fullName: string;
  readonly headline?: string;
  readonly summary?: string;
  readonly location?: string;
  readonly email?: string;

  readonly education: readonly EducationRecord[];

  readonly certifications: readonly CertificationRecord[];

  readonly resumeDocumentId?: string;

  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CandidateExperience {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly company: string;
  readonly title: string;
  readonly location?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly current?: boolean;
  readonly description?: string;
  readonly achievements: readonly string[];
  readonly technologies: readonly string[];
}

export interface CandidateProject {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly name: string;
  readonly description: string;
  readonly role?: string;
  readonly technologies: readonly string[];
  readonly responsibilities: readonly string[];
  readonly achievements: readonly string[];
  readonly challenges: readonly string[];
  readonly solutions: readonly string[];
  readonly outcomes: readonly string[];
  readonly startDate?: string;
  readonly endDate?: string;
  readonly repositoryUrl?: string;
  readonly liveUrl?: string;
}

export interface CandidateSkill {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly name: string;
  readonly category?: string;
  readonly level?: SkillLevel;
  readonly yearsOfExperience?: number;
  readonly evidenceIds: readonly string[];
}

export interface CandidateStory {
  readonly id: string;
  readonly candidateId: CandidateId;
  readonly title: string;
  readonly situation: string;
  readonly task: string;
  readonly action: string;
  readonly result: string;
  readonly skills: readonly string[];
  readonly topics: readonly string[];
  readonly verified: boolean;
  readonly source?: string;
}

export function createCandidateProfile(
  input: Omit<CandidateProfile, "createdAt" | "updatedAt">,
): CandidateProfile {
  const now = new Date().toISOString();

  return Object.freeze({
    ...input,
    id: input.id.trim(),
    fullName: input.fullName.trim(),
    headline: input.headline?.trim() || undefined,
    summary: input.summary?.trim() || undefined,
    location: input.location?.trim() || undefined,
    email: input.email?.trim().toLowerCase() || undefined,
    resumeDocumentId: input.resumeDocumentId?.trim() || undefined,
    education: Object.freeze(
      input.education.map((item) =>
        Object.freeze({
          ...item,
          institution: item.institution.trim(),
          degree: item.degree?.trim() || undefined,
          fieldOfStudy: item.fieldOfStudy?.trim() || undefined,
          description: item.description?.trim() || undefined,
        }),
      ),
    ),
    certifications: Object.freeze(
      input.certifications.map((item) =>
        Object.freeze({
          ...item,
          name: item.name.trim(),
          issuer: item.issuer?.trim() || undefined,
          credentialId: item.credentialId?.trim() || undefined,
        }),
      ),
    ),
    createdAt: now,
    updatedAt: now,
  });
}
