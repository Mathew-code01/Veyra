# Performance Targets

## Principle

Performance is measured with instrumentation and benchmarks rather than subjective claims.

## Metrics

### Audio

- capture-to-buffer;
- VAD segmentation;
- transcription;
- partial result;
- final result.

### Conversation

- transcript-to-question detection;
- classification latency;
- topic update latency.

### RAG

- embedding;
- retrieval;
- ranking;
- context construction.

### AI

- request;
- time to first token;
- completion;
- tokens/second where available.

### Vision

- preprocessing;
- OCR;
- model;
- end-to-end latency.

## Initial engineering targets

| Metric | Goal |
|---|---:|
| Typical UI interaction | <100 ms |
| Question detection after final transcript | <250 ms |
| Local retrieval | <100 ms |
| Typical cloud first token | <2 s |
| Vision preprocessing | <300 ms |
| Temporary capture cleanup | <5 s |

These are engineering targets, not guarantees.

## Memory

Bound audio buffers, image buffers, transcript rendering, streaming queues, and retry queues.

## Backpressure

When downstream processing is slower than input, reduce load, buffer within limits, or degrade gracefully.

## Reliability

Track success rate, timeout rate, cancellation rate, provider fallback rate, capture failures, and crash-free sessions.

## Benchmarking

Use:

```text
scripts/benchmark.ts
scripts/benchmark-audio.ts
scripts/benchmark-vision.ts
```

Benchmark fixtures must be synthetic or approved test data.
