// core/audio/SpeakerSegmenter.ts

export interface SpeakerSegment {
  readonly id: string;
  readonly speakerId: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly durationMs: number;
  readonly confidence?: number;
}

export interface SpeakerEmbedding {
  readonly timestamp: number;
  readonly vector: readonly number[];
}

export interface SpeakerSegmenterOptions {
  readonly similarityThreshold?: number;
  readonly minSegmentDurationMs?: number;
  readonly maxSpeakers?: number;
}

interface SpeakerProfile {
  readonly speakerId: string;
  readonly centroid: number[];
  sampleCount: number;
}

export class SpeakerSegmenter {
  private readonly similarityThreshold: number;
  private readonly minSegmentDurationMs: number;
  private readonly maxSpeakers: number;

  private readonly profiles: SpeakerProfile[] = [];

  public constructor(options: SpeakerSegmenterOptions = {}) {
    this.similarityThreshold = options.similarityThreshold ?? 0.78;

    this.minSegmentDurationMs = options.minSegmentDurationMs ?? 250;

    this.maxSpeakers = Math.max(1, options.maxSpeakers ?? 8);
  }

  public identify(embedding: SpeakerEmbedding): {
    speakerId: string;
    confidence: number;
  } {
    if (embedding.vector.length === 0) {
      return {
        speakerId: "speaker-unknown",
        confidence: 0,
      };
    }

    let bestProfile:
      | {
          profile: SpeakerProfile;
          similarity: number;
        }
      | undefined;

    for (const profile of this.profiles) {
      const similarity = cosineSimilarity(embedding.vector, profile.centroid);

      if (!bestProfile || similarity > bestProfile.similarity) {
        bestProfile = {
          profile,
          similarity,
        };
      }
    }

    if (bestProfile && bestProfile.similarity >= this.similarityThreshold) {
      updateCentroid(bestProfile.profile, embedding.vector);

      return {
        speakerId: bestProfile.profile.speakerId,
        confidence: bestProfile.similarity,
      };
    }

    if (this.profiles.length >= this.maxSpeakers) {
      return {
        speakerId: "speaker-unknown",
        confidence: 0,
      };
    }

    const speakerId = `speaker-${this.profiles.length + 1}`;

    this.profiles.push({
      speakerId,
      centroid: [...embedding.vector],
      sampleCount: 1,
    });

    return {
      speakerId,
      confidence: 1,
    };
  }

  public createSegment(
    speakerId: string,
    startTime: number,
    endTime: number,
    confidence?: number,
  ): SpeakerSegment | null {
    const durationMs = Math.max(0, endTime - startTime);

    if (durationMs < this.minSegmentDurationMs) {
      return null;
    }

    return {
      id: `segment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      speakerId,
      startTime,
      endTime,
      durationMs,
      confidence,
    };
  }

  public getSpeakers(): readonly string[] {
    return this.profiles.map((profile) => profile.speakerId);
  }

  public reset(): void {
    this.profiles.length = 0;
  }
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);

  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function updateCentroid(
  profile: SpeakerProfile,
  vector: readonly number[],
): void {
  const count = profile.sampleCount;

  if (profile.centroid.length !== vector.length) {
    return;
  }

  for (let index = 0; index < profile.centroid.length; index += 1) {
    profile.centroid[index] =
      (profile.centroid[index] * count + vector[index]) / (count + 1);
  }

  profile.sampleCount += 1;
}
