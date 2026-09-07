// core/context/ContextManager.ts
import type { Chunk, Chunker } from "./Chunker";

import type {
  DocumentInput,
  DocumentParser,
  ParsedDocument,
} from "./DocumentParser";

import type { EmbeddingService } from "./EmbeddingService";

import type { VectorRecord, VectorStore } from "./VectorStore";

import type { Retriever, RetrievedContext } from "./Retriever";

import type { ContextRanker, RankedContext } from "./ContextRanker";

import type { ContextCompressor, CompressedContext } from "./ContextCompressor";

export interface ContextManagerOptions {
  readonly parser: DocumentParser;
  readonly chunker: Chunker;
  readonly embeddings: EmbeddingService;
  readonly vectorStore: VectorStore;
  readonly retriever: Retriever;
  readonly ranker: ContextRanker;
  readonly compressor: ContextCompressor;
}

export interface IndexedDocument {
  readonly document: ParsedDocument;
  readonly chunks: readonly Chunk[];
}

export interface ContextQuery {
  readonly query: string;
  readonly limit?: number;
  readonly minScore?: number;
  readonly documentIds?: readonly string[];
  readonly documentTypes?: readonly string[];
  readonly candidateId?: string;
}

export interface ContextResult {
  readonly query: string;
  readonly retrieved: readonly RetrievedContext[];
  readonly contexts: readonly RankedContext[];
  readonly compressed: CompressedContext;
}

export class ContextManager {
  private readonly parser: DocumentParser;
  private readonly chunker: Chunker;
  private readonly embeddings: EmbeddingService;
  private readonly vectorStore: VectorStore;
  private readonly retriever: Retriever;
  private readonly ranker: ContextRanker;
  private readonly compressor: ContextCompressor;

  private readonly documents = new Map<string, ParsedDocument>();

  public constructor(options: ContextManagerOptions) {
    this.parser = options.parser;
    this.chunker = options.chunker;
    this.embeddings = options.embeddings;
    this.vectorStore = options.vectorStore;
    this.retriever = options.retriever;
    this.ranker = options.ranker;
    this.compressor = options.compressor;
  }

  public async indexDocument(input: DocumentInput): Promise<IndexedDocument> {
    const document = this.parser.parse(input);

    const chunks = this.chunker.chunk(document.id, document.text, {
      ...document.metadata,
      type: document.type,
      documentName: document.name,
    });

    await this.vectorStore.deleteByDocument(document.id);

    if (chunks.length > 0) {
      const embeddingResult = await this.embeddings.embed(
        chunks.map((chunk) => chunk.text),
      );

      if (embeddingResult.embeddings.length !== chunks.length) {
        throw new Error(
          `Embedding count mismatch for document "${document.id}".`,
        );
      }

      const records: VectorRecord[] = chunks.map((chunk, index) => {
        const vector = embeddingResult.embeddings[index];

        if (!vector) {
          throw new Error(`Missing embedding for chunk "${chunk.id}".`);
        }

        return {
          id: chunk.id,
          vector,
          text: chunk.text,
          documentId: document.id,
          metadata: {
            ...chunk.metadata,
            documentId: document.id,
            type: document.type,
            candidateId:
              typeof document.metadata.candidateId === "string"
                ? document.metadata.candidateId
                : undefined,
          },
        };
      });

      await this.vectorStore.upsert(records);
    }

    this.documents.set(document.id, document);

    return {
      document,
      chunks,
    };
  }

  public async removeDocument(documentId: string): Promise<void> {
    await this.vectorStore.deleteByDocument(documentId);

    this.documents.delete(documentId);
  }

  public async query(request: ContextQuery): Promise<ContextResult> {
    const query = request.query.trim();

    if (!query) {
      return {
        query: "",
        retrieved: [],
        contexts: [],
        compressed: this.compressor.compress([]),
      };
    }

    const retrieved = await this.retriever.retrieve(query, {
      limit: request.limit,
      minScore: request.minScore,
      documentIds: request.documentIds,
      documentTypes: request.documentTypes,
      candidateId: request.candidateId,
    });

    const ranked = this.ranker.rank(retrieved);

    const compressed = this.compressor.compress(ranked);

    return {
      query,
      retrieved,
      contexts: ranked,
      compressed,
    };
  }

  public getDocument(documentId: string): ParsedDocument | undefined {
    return this.documents.get(documentId);
  }

  public getDocuments(): readonly ParsedDocument[] {
    return [...this.documents.values()];
  }

  public async clear(): Promise<void> {
    await this.vectorStore.clear();
    this.documents.clear();
  }

  public async getIndexedChunkCount(): Promise<number> {
    return this.vectorStore.count();
  }
}