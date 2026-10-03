// ============================================================================
// FILE: core/context/createContextEngine.ts
//
// PURPOSE:
// Composition root for the generic Context subsystem.
//
// IMPORTANT:
// This file creates Context infrastructure only.
//
// It deliberately does NOT instantiate:
// - CandidateEvidenceRetriever
// - ConversationManager
// - InterviewEngine
// - VisionAnalyzer
// - DocumentService
//
// Those domains connect to Context through their own boundaries/adapters.
//
// DEVELOPMENT NOTE:
// MockEmbeddingService + InMemoryVectorStore are currently development
// implementations. Production composition should replace them with concrete
// persistent/real embedding implementations without changing ContextManager.
// ============================================================================

import { ContextManager } from "./ContextManager";

import { DefaultContextParser } from "./ingestion/ContextParser";

import { DefaultChunker } from "./ingestion/Chunker";

import { MockEmbeddingService } from "./embeddings/EmbeddingService";

import { InMemoryVectorStore } from "./storage/VectorStore";

import { SemanticRetriever } from "./retrieval/Retriever";

import { ContextRanker } from "./retrieval/ContextRanker";

import { ContextCompressor } from "./retrieval/ContextCompressor";

// ============================================================================
// ENGINE
// ============================================================================

export interface ContextEngine {
  readonly manager: ContextManager;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createContextEngine(): ContextEngine {
  const embeddings = new MockEmbeddingService(384);

  const vectorStore = new InMemoryVectorStore();

  const retriever = new SemanticRetriever(embeddings, vectorStore);

  /**
   * Generic Context ranking.
   *
   * No candidate/interview-specific priorities are encoded here.
   *
   * Higher-level orchestration can inject policy when required.
   */
  const ranker = new ContextRanker();

  const compressor = new ContextCompressor({
    maxCharacters: 8000,
  });

  const manager = new ContextManager({
    parser: new DefaultContextParser(),

    chunker: new DefaultChunker(),

    embeddings,

    vectorStore,

    retriever,

    ranker,

    compressor,
  });

  return {
    manager,
  };
}
