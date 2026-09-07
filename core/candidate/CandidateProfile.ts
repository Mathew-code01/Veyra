// core/candidate/CandidateProfile.ts

export interface CandidateProfile {
  readonly id: string;
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

export function createCandidateProfile(
  input: Omit<CandidateProfile, "createdAt" | "updatedAt">,
): CandidateProfile {
  const now = new Date().toISOString();

  return {
    ...input,
    education: [...input.education],
    certifications: [...input.certifications],
    createdAt: now,
    updatedAt: now,
  };
}