import { describe, expect, it, vi } from "vitest";

import { ContextManager } from "../../../core/context/ContextManager";
import { DefaultContextParser } from "../../../core/context/ingestion/ContextParser";
import { DefaultChunker } from "../../../core/context/ingestion/Chunker";
import { MockEmbeddingService } from "../../../core/context/embeddings/EmbeddingService";
import { ContextCompressor } from "../../../core/context/retrieval/ContextCompressor";
import { ContextRanker } from "../../../core/context/retrieval/ContextRanker";
import { SemanticRetriever } from "../../../core/context/retrieval/Retriever";
import { InMemoryVectorStore } from "../../../core/context/storage/VectorStore";

describe("keyword-only context retrieval", () => {
  it("does not generate mock vectors when semantic embeddings are unavailable", async () => {
    const embeddings = new MockEmbeddingService(8);
    const embed = vi.spyOn(embeddings, "embed");
    const embedOne = vi.spyOn(embeddings, "embedOne");
    const vectorStore = new InMemoryVectorStore();
    const retriever = new SemanticRetriever(embeddings, vectorStore);
    const manager = new ContextManager({
      parser: new DefaultContextParser(),
      chunker: new DefaultChunker(),
      embeddings,
      vectorStore,
      retriever,
      ranker: new ContextRanker(),
      compressor: new ContextCompressor(),
    });

    await manager.index({
      id: "candidate-context",
      name: "Candidate experience",
      contentType: "experience",
      source: { type: "candidate" },
      scope: { candidateId: "candidate-1" },
      text: "Built production systems with TypeScript and React.",
    });

    const results = await retriever.retrieve("TypeScript React", {
      scope: { candidateId: "candidate-1" },
    });

    expect(embed).not.toHaveBeenCalled();
    expect(embedOne).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].text).toContain("TypeScript");
    expect(results[0].metadata.embeddingModel).toBe("keyword-only");
    expect(await vectorStore.count()).toBe(1);
  });
});
