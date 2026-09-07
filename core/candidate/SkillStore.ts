// core/candidate/SkillStore.ts

export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

export interface CandidateSkill {
  readonly id: string;
  readonly candidateId: string;
  readonly name: string;
  readonly category?: string;
  readonly level?: SkillLevel;
  readonly yearsOfExperience?: number;
  readonly evidenceIds: readonly string[];
}

export interface SkillStore {
  list(candidateId: string): Promise<readonly CandidateSkill[]>;

  save(skill: CandidateSkill): Promise<void>;

  remove(candidateId: string, skillId: string): Promise<void>;
}

export class InMemorySkillStore implements SkillStore {
  private readonly records = new Map<string, CandidateSkill>();

  public async list(candidateId: string): Promise<readonly CandidateSkill[]> {
    return [...this.records.values()].filter(
      (skill) => skill.candidateId === candidateId,
    );
  }

  public async save(skill: CandidateSkill): Promise<void> {
    this.records.set(skill.id, {
      ...skill,
      evidenceIds: [...skill.evidenceIds],
    });
  }

  public async remove(candidateId: string, skillId: string): Promise<void> {
    const skill = this.records.get(skillId);

    if (skill?.candidateId === candidateId) {
      this.records.delete(skillId);
    }
  }
}