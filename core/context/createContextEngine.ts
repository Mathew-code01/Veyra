// core/context/createContextEngine.ts

import { ContextManager } from "./ContextManager";

import { DefaultDocumentParser } from "./DocumentParser";

import { DefaultChunker } from "./Chunker";

import { MockEmbeddingService } from "./EmbeddingService";

import { InMemoryVectorStore } from "./VectorStore";

import { SemanticRetriever } from "./Retriever";

import { ContextRanker } from "./ContextRanker";

import { ContextCompressor } from "./ContextCompressor";

import { CandidateEvidenceRetriever } from "../candidate/CandidateEvidenceRetriever";

export interface ContextEngine {
  readonly manager: ContextManager;
  readonly candidateEvidence: CandidateEvidenceRetriever;
}

export function createContextEngine(): ContextEngine {
  const embeddings = new MockEmbeddingService(384);

  const vectorStore = new InMemoryVectorStore();

  const retriever = new SemanticRetriever(embeddings, vectorStore);

  const ranker = new ContextRanker();

  const compressor = new ContextCompressor({
    maxCharacters: 8000,
  });

  const manager = new ContextManager({
    parser: new DefaultDocumentParser(),
    chunker: new DefaultChunker(),
    embeddings,
    vectorStore,
    retriever,
    ranker,
    compressor,
  });

  return {
    manager,
    candidateEvidence: new CandidateEvidenceRetriever(manager),
  };
}