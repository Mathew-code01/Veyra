// ============================================================================
// FILE: core/candidate/stores/CandidateProfileStore.ts
// PURPOSE:
// Storage boundary for candidate profiles.
//
// The interface is persistence-agnostic. A database, encrypted local store,
// SQLite, or another implementation can be added later without changing
// Candidate-domain consumers.
//
// Candidate-2 will provide the persistent repository implementation.
// ============================================================================

import type { CandidateProfile } from "../contracts/CandidateTypes";
import { CandidateError } from "../errors/CandidateError";
import { CandidateValidator } from "../validation/CandidateValidator";

export interface CandidateProfileStore {
  get(candidateId: string): Promise<CandidateProfile | undefined>;

  save(profile: CandidateProfile): Promise<void>;

  remove(candidateId: string): Promise<void>;
}

export class InMemoryCandidateProfileStore implements CandidateProfileStore {
  private readonly records = new Map<string, CandidateProfile>();

  private readonly validator: CandidateValidator;

  public constructor(validator: CandidateValidator = new CandidateValidator()) {
    this.validator = validator;
  }

  public async get(candidateId: string): Promise<CandidateProfile | undefined> {
    this.validator.validateCandidateId(candidateId);

    const normalizedCandidateId = candidateId.trim();

    const profile = this.records.get(normalizedCandidateId);

    return profile === undefined ? undefined : this.clone(profile);
  }

  public async save(profile: CandidateProfile): Promise<void> {
    this.validator.validateProfile(profile);

    const candidateId = profile.id.trim();

    if (this.records.has(candidateId)) {
      throw CandidateError.alreadyExists(
        `Candidate profile '${candidateId}' already exists.`,
        {
          stage: "profile",
          candidateId,
        },
      );
    }

    this.records.set(candidateId, this.clone(profile));
  }

  public async remove(candidateId: string): Promise<void> {
    this.validator.validateCandidateId(candidateId);

    this.records.delete(candidateId.trim());
  }

  private clone(profile: CandidateProfile): CandidateProfile {
    return Object.freeze({
      ...profile,
      id: profile.id.trim(),

      education: Object.freeze(
        profile.education.map((education) =>
          Object.freeze({
            ...education,
          }),
        ),
      ),

      certifications: Object.freeze(
        profile.certifications.map((certification) =>
          Object.freeze({
            ...certification,
          }),
        ),
      ),
    });
  }
}
