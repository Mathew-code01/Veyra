// ============================================================================
// FILE: core/candidate/stores/ProjectStore.ts
// PURPOSE:
// Candidate project storage boundary.
//
// Candidate-1 provides the domain contract and in-memory implementation.
// Candidate-2 will provide persistent storage.
// ============================================================================

import type { CandidateProject } from "../contracts/CandidateTypes";
import { CandidateError } from "../errors/CandidateError";
import { CandidateValidator } from "../validation/CandidateValidator";

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

  private readonly validator: CandidateValidator;

  public constructor(validator: CandidateValidator = new CandidateValidator()) {
    this.validator = validator;
  }

  public async list(candidateId: string): Promise<readonly CandidateProject[]> {
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
    projectId: string,
  ): Promise<CandidateProject | undefined> {
    this.validator.validateCandidateId(candidateId);

    const id = projectId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Project id is required.", {
        stage: "project",
        candidateId: candidateId.trim(),
      });
    }

    const record = this.records.get(id);

    if (record === undefined || record.candidateId !== candidateId.trim()) {
      return undefined;
    }

    return this.clone(record);
  }

  public async save(project: CandidateProject): Promise<void> {
    this.validator.validateProject(project);

    const candidateId = project.candidateId.trim();
    const id = project.id.trim();

    const existing = this.records.get(id);

    if (existing !== undefined && existing.candidateId !== candidateId) {
      throw CandidateError.conflict(
        "Project cannot be reassigned to another candidate.",
        {
          stage: "project",
          candidateId,
          recordId: id,
        },
      );
    }

    this.records.set(
      id,
      this.clone({
        ...project,
        id,
        candidateId,
      }),
    );
  }

  public async remove(candidateId: string, projectId: string): Promise<void> {
    this.validator.validateCandidateId(candidateId);

    const id = projectId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Project id is required.", {
        stage: "project",
        candidateId: candidateId.trim(),
      });
    }

    const record = this.records.get(id);

    if (record !== undefined && record.candidateId === candidateId.trim()) {
      this.records.delete(id);
    }
  }

  private clone(project: CandidateProject): CandidateProject {
    return Object.freeze({
      ...project,

      id: project.id.trim(),

      candidateId: project.candidateId.trim(),

      technologies: Object.freeze([...project.technologies]),

      responsibilities: Object.freeze([...project.responsibilities]),

      achievements: Object.freeze([...project.achievements]),

      challenges: Object.freeze([...project.challenges]),

      solutions: Object.freeze([...project.solutions]),

      outcomes: Object.freeze([...project.outcomes]),
    });
  }
}
