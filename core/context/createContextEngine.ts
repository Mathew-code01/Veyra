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
//   - Without both a model file and its compatible tokenizer, Context uses
//     lexical matching over stored text. It does not generate synthetic
//     embeddings.
// ============================================================================

import { existsSync } from "node:fs";

import { ContextManager } from "./ContextManager";

import { DefaultContextParser } from "./ingestion/ContextParser";

import { DefaultChunker } from "./ingestion/Chunker";

import {
  KeywordOnlyEmbeddingService,
  type EmbeddingService,
} from "./embeddings/EmbeddingService";

import {
  OnnxEmbeddingService,
  type OnnxEmbeddingServiceOptions,
} from "./embeddings/OnnxEmbeddingService";

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
   * Whether the configured ONNX model has completed a successful inference.
   * This remains false before the first semantic query and in keyword mode.
   */
  readonly semanticAvailable: boolean;

  /** Retrieval strategy selected from the available embedding configuration. */
  readonly retrievalMode: "semantic" | "keyword";
}

// ============================================================================
// FACTORY
// ============================================================================

export interface CreateContextEngineOptions {
  readonly embeddingModelPath?: string;
  readonly embeddingTokenizer?: OnnxEmbeddingServiceOptions["tokenizer"];
}

export function createContextEngine(
  options: CreateContextEngineOptions = {},
): ContextEngine {
  const modelPath =
    options.embeddingModelPath ?? process.env.VEYRA_EMBEDDING_MODEL_PATH;

  let embeddings: EmbeddingService;

  if (modelPath && existsSync(modelPath) && options.embeddingTokenizer) {
    embeddings = new OnnxEmbeddingService({
      modelPath,
      tokenizer: options.embeddingTokenizer,

      dimensions: 384,

      model: "onnx-embedding",

      maxLength: 128,

      meanPool: true,
    });
  } else {
    embeddings = new KeywordOnlyEmbeddingService();
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

    get semanticAvailable() {
      return (
        embeddings instanceof OnnxEmbeddingService &&
        embeddings.hasSuccessfulInference
      );
    },

    get retrievalMode() {
      return embeddings.supportsSemanticEmbeddings ? "semantic" : "keyword";
    },
  };
}
