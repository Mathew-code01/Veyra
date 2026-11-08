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
// PRODUCTION COMPOSITION:
//   - OnnxEmbeddingService is used when a compatible ONNX embedding model is
//     available (VEYRA_EMBEDDING_MODEL_PATH). It runs fully offline.
//   - SqliteVectorStore persists vectors in SQLite (survives restart).
//   - If no embedding model is available, MockEmbeddingService is used as a
//     degraded fallback so indexing still works; semantic retrieval is then
//     unavailable and callers should rely on keyword search. This fallback is
//     exposed via `semanticAvailable` and is NOT production semantic search.
// ============================================================================

import { ContextManager } from "./ContextManager";

import { DefaultContextParser } from "./ingestion/ContextParser";

import { DefaultChunker } from "./ingestion/Chunker";

import { MockEmbeddingService } from "./embeddings/EmbeddingService";

import { OnnxEmbeddingService } from "./embeddings/OnnxEmbeddingService";

import { SqliteVectorStore } from "./storage/SqliteVectorStore";

import { SemanticRetriever } from "./retrieval/Retriever";

import { ContextRanker } from "./retrieval/ContextRanker";

import { ContextCompressor } from "./retrieval/ContextCompressor";

// ============================================================================
// ENGINE
// ============================================================================

export interface ContextEngine {
  readonly manager: ContextManager;

  /**
   * Whether real (non-mock) semantic embedding is available.
   *
   * When false, the embedding service is a degraded fallback and semantic
   * similarity results are not meaningful. Keyword retrieval remains usable.
   */
  readonly semanticAvailable: boolean;
}

// ============================================================================
// FACTORY
// ============================================================================

export interface CreateContextEngineOptions {
  readonly embeddingModelPath?: string;
}

export function createContextEngine(
  options: CreateContextEngineOptions = {},
): ContextEngine {
  const modelPath =
    options.embeddingModelPath ?? process.env.VEYRA_EMBEDDING_MODEL_PATH;

  let embeddings: import("./embeddings/EmbeddingService").EmbeddingService;

  let semanticAvailable = false;

  if (modelPath) {
    try {
      embeddings = new OnnxEmbeddingService({
        modelPath,

        dimensions: 384,

        model: "onnx-embedding",

        maxLength: 128,

        meanPool: true,
      });

      semanticAvailable = true;
    } catch {
      // No usable model: degrade to mock embeddings so indexing still works.
      // Semantic retrieval will be unavailable; keyword search remains usable.
      embeddings = new MockEmbeddingService(384);

      semanticAvailable = false;
    }
  } else {
    embeddings = new MockEmbeddingService(384);

    semanticAvailable = false;
  }

  const vectorStore = new SqliteVectorStore();

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

    semanticAvailable,
  };
}
