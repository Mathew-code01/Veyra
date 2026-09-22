// ============================================================================
// FILE: core/candidate/stores/ExperienceStore.ts
// PURPOSE:
// Candidate employment/experience storage boundary.
//
// Candidate-1 provides the domain contract and in-memory implementation.
// Candidate-2 will provide the persistent implementation.
// ============================================================================

import type { CandidateExperience } from "../contracts/CandidateTypes";
import { CandidateError } from "../errors/CandidateError";
import { CandidateValidator } from "../validation/CandidateValidator";

export interface ExperienceStore {
  list(candidateId: string): Promise<readonly CandidateExperience[]>;

  get(
    candidateId: string,
    experienceId: string,
  ): Promise<CandidateExperience | undefined>;

  save(experience: CandidateExperience): Promise<void>;

  remove(candidateId: string, experienceId: string): Promise<void>;
}

export class InMemoryExperienceStore implements ExperienceStore {
  private readonly records = new Map<string, CandidateExperience>();

  private readonly validator: CandidateValidator;

  public constructor(validator: CandidateValidator = new CandidateValidator()) {
    this.validator = validator;
  }

  public async list(
    candidateId: string,
  ): Promise<readonly CandidateExperience[]> {
    this.validator.validateCandidateId(candidateId);

    const normalizedCandidateId = candidateId.trim();

    return Object.freeze(
      [...this.records.values()]
        .filter((record) => record.candidateId === normalizedCandidateId)
        .map((record) => this.clone(record)),
    );
  }

  public async get(
    candidateId: string,
    experienceId: string,
  ): Promise<CandidateExperience | undefined> {
    this.validator.validateCandidateId(candidateId);

    const id = experienceId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Experience id is required.", {
        stage: "experience",
        candidateId: candidateId.trim(),
      });
    }

    const record = this.records.get(id);

    if (record === undefined || record.candidateId !== candidateId.trim()) {
      return undefined;
    }

    return this.clone(record);
  }

  public async save(experience: CandidateExperience): Promise<void> {
    this.validator.validateExperience(experience);

    const candidateId = experience.candidateId.trim();
    const id = experience.id.trim();

    const existing = this.records.get(id);

    if (existing !== undefined && existing.candidateId !== candidateId) {
      throw CandidateError.conflict(
        "Experience cannot be reassigned to another candidate.",
        {
          stage: "experience",
          candidateId,
          recordId: id,
        },
      );
    }

    this.records.set(
      id,
      this.clone({
        ...experience,
        id,
        candidateId,
      }),
    );
  }

  public async remove(
    candidateId: string,
    experienceId: string,
  ): Promise<void> {
    this.validator.validateCandidateId(candidateId);

    const id = experienceId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Experience id is required.", {
        stage: "experience",
        candidateId: candidateId.trim(),
      });
    }

    const record = this.records.get(id);

    if (record !== undefined && record.candidateId === candidateId.trim()) {
      this.records.delete(id);
    }
  }

  private clone(experience: CandidateExperience): CandidateExperience {
    return Object.freeze({
      ...experience,

      id: experience.id.trim(),

      candidateId: experience.candidateId.trim(),

      achievements: Object.freeze([...experience.achievements]),

      technologies: Object.freeze([...experience.technologies]),
    });
  }
}
