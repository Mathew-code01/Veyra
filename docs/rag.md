# Retrieval-Augmented Generation

## Objective

Retrieve only relevant candidate information for each question.

## Sources

- resume;
- experience;
- skills;
- projects;
- STAR stories;
- education;
- certifications;
- job descriptions;
- company research.

## Indexing

```text
Source
 ↓
Parse
 ↓
Normalize
 ↓
Chunk
 ↓
Metadata
 ↓
Embedding
 ↓
Index
```

## Retrieval

```text
Question
 ↓
Query representation
 ↓
Filters
 ↓
Similarity search
 ↓
Ranking
 ↓
Compression
 ↓
Prompt context
```

## Metadata

Each chunk should identify its source and useful category metadata.

## Ranking

Ranking can combine semantic similarity, source priority, recency, interview mode, and confidence.

## Prompt-injection protection

Retrieved text is untrusted data. It must not override system policies or become an instruction to execute desktop operations.

## Deletion

Deleting a source must remove dependent chunks and embeddings.

## Evaluation

Measure:

- retrieval latency;
- recall@k;
- evidence relevance;
- unsupported-claim rate;
- context size.

## Local-first

The vector-store interface should support local implementations without forcing a cloud vector database.
