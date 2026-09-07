// core/candidate/ProjectStore.ts

export interface CandidateProject {
  readonly id: string;
  readonly candidateId: string;
  readonly name: string;
  readonly description: string;
  readonly role?: string;
  readonly technologies: readonly string[];
  readonly responsibilities: readonly string[];
  readonly achievements: readonly string[];
  readonly challenges: readonly string[];
  readonly solutions: readonly string[];
  readonly outcomes: readonly string[];
  readonly url?: string;
  readonly repositoryUrl?: string;
}

export interface ProjectStore {
  list(candidateId: string): Promise<readonly CandidateProject[]>;

  get(
    candidateId: string,
    projectId: string,
  ): Promise<CandidateProject | undefined>;

  save(project: CandidateProject): Promise<void>;

  remove(candidateId: string, projectId: string): Promise<void>;
}

export class InMemoryProjectStore implements ProjectStore {
  private readonly records = new Map<string, CandidateProject>();

  public async list(candidateId: string): Promise<readonly CandidateProject[]> {
    return [...this.records.values()].filter(
      (project) => project.candidateId === candidateId,
    );
  }

  public async get(
    candidateId: string,
    projectId: string,
  ): Promise<CandidateProject | undefined> {
    const project = this.records.get(projectId);

    if (!project || project.candidateId !== candidateId) {
      return undefined;
    }

    return project;
  }

  public async save(project: CandidateProject): Promise<void> {
    this.records.set(project.id, {
      ...project,
      technologies: [...project.technologies],
      responsibilities: [...project.responsibilities],
      achievements: [...project.achievements],
      challenges: [...project.challenges],
      solutions: [...project.solutions],
      outcomes: [...project.outcomes],
    });
  }

  public async remove(candidateId: string, projectId: string): Promise<void> {
    const project = this.records.get(projectId);

    if (project?.candidateId === candidateId) {
      this.records.delete(projectId);
    }
  }
}