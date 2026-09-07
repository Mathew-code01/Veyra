// core/candidate/ExperienceStore.ts

export interface CandidateExperience {
  readonly id: string;
  readonly candidateId: string;
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

  public async list(
    candidateId: string,
  ): Promise<readonly CandidateExperience[]> {
    return [...this.records.values()].filter(
      (record) => record.candidateId === candidateId,
    );
  }

  public async get(
    candidateId: string,
    experienceId: string,
  ): Promise<CandidateExperience | undefined> {
    const record = this.records.get(experienceId);

    if (!record || record.candidateId !== candidateId) {
      return undefined;
    }

    return record;
  }

  public async save(experience: CandidateExperience): Promise<void> {
    this.records.set(experience.id, {
      ...experience,
      achievements: [...experience.achievements],
      technologies: [...experience.technologies],
    });
  }

  public async remove(
    candidateId: string,
    experienceId: string,
  ): Promise<void> {
    const record = this.records.get(experienceId);

    if (record?.candidateId === candidateId) {
      this.records.delete(experienceId);
    }
  }
}