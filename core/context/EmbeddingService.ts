// core/context/EmbeddingService.ts

export interface EmbeddingResult {
  readonly embeddings: readonly (readonly number[])[];
  readonly model?: string;
  readonly dimensions?: number;
}

export interface EmbeddingService {
  embed(texts: readonly string[]): Promise<EmbeddingResult>;

  embedOne(text: string): Promise<readonly number[]>;
}

export class MockEmbeddingService implements EmbeddingService {
  private readonly dimensions: number;

  public constructor(dimensions = 384) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error("Embedding dimensions must be a positive integer.");
    }

    this.dimensions = dimensions;
  }

  public async embed(texts: readonly string[]): Promise<EmbeddingResult> {
    return {
      embeddings: texts.map((text) => this.createEmbedding(text)),
      model: "mock-deterministic",
      dimensions: this.dimensions,
    };
  }

  public async embedOne(text: string): Promise<readonly number[]> {
    return this.createEmbedding(text);
  }

  private createEmbedding(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);

    const normalized = text.toLowerCase().trim();

    if (!normalized) {
      return vector;
    }

    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);

      const position = (code * 31 + index * 17) % this.dimensions;

      vector[position] += 1;
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => value / magnitude);
  }
}