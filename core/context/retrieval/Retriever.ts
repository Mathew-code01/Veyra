// core/context/Retriever.ts

import type { EmbeddingService } from "./EmbeddingService";
import type {
  VectorSearchOptions,
  VectorSearchResult,
  VectorStore,
} from "./VectorStore";

export interface RetrievedContext {
  readonly id: string;
  readonly documentId: string;
  readonly text: string;
  readonly score: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RetrievalOptions {
  readonly limit?: number;
  readonly minScore?: number;
  readonly documentIds?: readonly string[];
  readonly documentTypes?: readonly string[];
  readonly candidateId?: string;
}

export interface Retriever {
  retrieve(
    query: string,
    options?: RetrievalOptions,
  ): Promise<readonly RetrievedContext[]>;
}

export class SemanticRetriever implements Retriever {
  public constructor(
    private readonly embeddings: EmbeddingService,
    private readonly vectorStore: VectorStore,
  ) {}

  public async retrieve(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<readonly RetrievedContext[]> {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return [];
    }

    const vector = await this.embeddings.embedOne(normalizedQuery);

    const searchOptions: VectorSearchOptions = {
      limit: options.limit ?? 8,
      minScore: options.minScore ?? 0.25,
      documentIds: options.documentIds,
      documentTypes: options.documentTypes,
      candidateId: options.candidateId,
    };

    const results = await this.vectorStore.search(vector, searchOptions);

    return results.map((result: VectorSearchResult): RetrievedContext => ({
      id: result.record.id,
      documentId: result.record.documentId,
      text: result.record.text,
      score: result.score,
      metadata: result.record.metadata,
    }));
  }
}