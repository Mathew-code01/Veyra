// core/candidate/StoryStore.ts

export interface CandidateStory {
  readonly id: string;
  readonly candidateId: string;
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

  public async list(candidateId: string): Promise<readonly CandidateStory[]> {
    return [...this.records.values()].filter(
      (story) => story.candidateId === candidateId,
    );
  }

  public async get(
    candidateId: string,
    storyId: string,
  ): Promise<CandidateStory | undefined> {
    const story = this.records.get(storyId);

    if (!story || story.candidateId !== candidateId) {
      return undefined;
    }

    return story;
  }

  public async save(story: CandidateStory): Promise<void> {
    this.records.set(story.id, {
      ...story,
      skills: [...story.skills],
      topics: [...story.topics],
    });
  }

  public async remove(candidateId: string, storyId: string): Promise<void> {
    const story = this.records.get(storyId);

    if (story?.candidateId === candidateId) {
      this.records.delete(storyId);
    }
  }
}