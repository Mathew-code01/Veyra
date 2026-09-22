// ============================================================================
// FILE: core/candidate/stores/SkillStore.ts
// PURPOSE:
// Candidate skill storage boundary.
//
// Skills may later be linked to evidence/provenance in Candidate-4.
// Candidate-1 therefore stores only the domain relationship.
// ============================================================================

import type { CandidateSkill } from "../contracts/CandidateTypes";
import { CandidateError } from "../errors/CandidateError";
import { CandidateValidator } from "../validation/CandidateValidator";

export interface SkillStore {
  list(candidateId: string): Promise<readonly CandidateSkill[]>;

  get(
    candidateId: string,
    skillId: string,
  ): Promise<CandidateSkill | undefined>;

  save(skill: CandidateSkill): Promise<void>;

  remove(candidateId: string, skillId: string): Promise<void>;
}

export class InMemorySkillStore implements SkillStore {
  private readonly records = new Map<string, CandidateSkill>();

  private readonly validator: CandidateValidator;

  public constructor(validator: CandidateValidator = new CandidateValidator()) {
    this.validator = validator;
  }

  public async list(candidateId: string): Promise<readonly CandidateSkill[]> {
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
    skillId: string,
  ): Promise<CandidateSkill | undefined> {
    this.validator.validateCandidateId(candidateId);

    const id = skillId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Skill id is required.", {
        stage: "skill",
        candidateId: candidateId.trim(),
      });
    }

    const record = this.records.get(id);

    if (record === undefined || record.candidateId !== candidateId.trim()) {
      return undefined;
    }

    return this.clone(record);
  }

  public async save(skill: CandidateSkill): Promise<void> {
    this.validator.validateSkill(skill);

    const candidateId = skill.candidateId.trim();
    const id = skill.id.trim();

    const existing = this.records.get(id);

    if (existing !== undefined && existing.candidateId !== candidateId) {
      throw CandidateError.conflict(
        "Skill cannot be reassigned to another candidate.",
        {
          stage: "skill",
          candidateId,
          recordId: id,
        },
      );
    }

    this.records.set(
      id,
      this.clone({
        ...skill,
        id,
        candidateId,
      }),
    );
  }

  public async remove(candidateId: string, skillId: string): Promise<void> {
    this.validator.validateCandidateId(candidateId);

    const id = skillId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Skill id is required.", {
        stage: "skill",
        candidateId: candidateId.trim(),
      });
    }

    const record = this.records.get(id);

    if (record !== undefined && record.candidateId === candidateId.trim()) {
      this.records.delete(id);
    }
  }

  private clone(skill: CandidateSkill): CandidateSkill {
    return Object.freeze({
      ...skill,

      id: skill.id.trim(),

      candidateId: skill.candidateId.trim(),

      evidenceIds: Object.freeze([...skill.evidenceIds]),
    });
  }
}
