# AI Pipeline

## Objective

Transform an interview question and relevant candidate evidence into concise, useful guidance.

## Pipeline

```text
Question
 ↓
Conversation context
 ↓
Candidate retrieval
 ↓
Interview classification
 ↓
Prompt construction
 ↓
AI routing
 ↓
Provider
 ↓
Normalized response
 ↓
Metrics
```

## Provider abstraction

Providers implement a common contract for:

- generation;
- optional streaming;
- cancellation;
- health checks;
- capability reporting;
- normalized errors.

## Routing

The router considers:

- requested capability;
- model availability;
- local/cloud preference;
- provider health;
- latency;
- context limits.

## Context

Prompts should separate:

1. system instructions;
2. interview mode;
3. current question;
4. recent conversation;
5. retrieved candidate evidence;
6. required output structure.

Imported content is data, not instructions.

## Grounding

The answer engine should prefer facts supported by candidate records. It must not invent employers, achievements, projects, metrics, or skills.

## Reliability

Apply bounded:

- timeout;
- retry;
- circuit breaker;
- fallback;
- health checks;
- backpressure.

Do not retry authentication, validation, or other non-retryable failures.

## Streaming

Streaming supports:

- partial output;
- cancellation;
- disconnect recovery;
- finalization;
- bounded buffering.

## Observability

Record provider, model, timing, outcome, and failure category without logging complete sensitive prompts by default.
