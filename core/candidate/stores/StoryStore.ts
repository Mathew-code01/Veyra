// ============================================================================
// FILE: core/candidate/stores/StoryStore.ts
// PURPOSE:
// Candidate behavioral/project story storage boundary.
//
// Stories are deliberately generic enough to support:
// - behavioral interviews
// - leadership
// - conflict
// - teamwork
// - achievements
// - failures
// - project experience
// - communication
// - product interviews
// - case interviews
//
// They are NOT limited to coding interviews.
// ============================================================================

import type { CandidateStory } from "../contracts/CandidateTypes";
import { CandidateError } from "../errors/CandidateError";
import { CandidateValidator } from "../validation/CandidateValidator";

export interface StoryStore {
  list(candidateId: string): Promise<readonly CandidateStory[]>;

  get(
    candidateId: string,
    storyId: string,
  ): Promise<CandidateStory | undefined>;

  save(story: CandidateStory): Promise<void>;

  remove(candidateId: string, storyId: string): Promise<void>;
}

export class InMemoryStoryStore implements StoryStore {
  private readonly records = new Map<string, CandidateStory>();

  private readonly validator: CandidateValidator;

  public constructor(validator: CandidateValidator = new CandidateValidator()) {
    this.validator = validator;
  }

  public async list(candidateId: string): Promise<readonly CandidateStory[]> {
    this.validator.validateCandidateId(candidateId);

    const normalizedCandidateId = candidateId.trim();

    return Object.freeze(
      [...this.records.values()]
        .filter((story) => story.candidateId === normalizedCandidateId)
        .map((story) => this.clone(story)),
    );
  }

  public async get(
    candidateId: string,
    storyId: string,
  ): Promise<CandidateStory | undefined> {
    this.validator.validateCandidateId(candidateId);

    const id = storyId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Story id is required.", {
        stage: "story",
        candidateId: candidateId.trim(),
      });
    }

    const story = this.records.get(id);

    if (story === undefined || story.candidateId !== candidateId.trim()) {
      return undefined;
    }

    return this.clone(story);
  }

  public async save(story: CandidateStory): Promise<void> {
    this.validator.validateStory(story);

    const candidateId = story.candidateId.trim();
    const id = story.id.trim();

    const existing = this.records.get(id);

    if (existing !== undefined && existing.candidateId !== candidateId) {
      throw CandidateError.conflict(
        "Story cannot be reassigned to another candidate.",
        {
          stage: "story",
          candidateId,
          recordId: id,
        },
      );
    }

    this.records.set(
      id,
      this.clone({
        ...story,
        id,
        candidateId,
      }),
    );
  }

  public async remove(candidateId: string, storyId: string): Promise<void> {
    this.validator.validateCandidateId(candidateId);

    const id = storyId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Story id is required.", {
        stage: "story",
        candidateId: candidateId.trim(),
      });
    }

    const story = this.records.get(id);

    if (story !== undefined && story.candidateId === candidateId.trim()) {
      this.records.delete(id);
    }
  }

  private clone(story: CandidateStory): CandidateStory {
    return Object.freeze({
      ...story,

      id: story.id.trim(),

      candidateId: story.candidateId.trim(),

      skills: Object.freeze([...story.skills]),

      topics: Object.freeze([...story.topics]),
    });
  }
}
