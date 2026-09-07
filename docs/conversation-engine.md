# Conversation Engine

## Purpose

Maintain structured conversational state rather than treating each transcript sentence as an isolated request.

## Pipeline

```text
Transcript
 ↓
Normalization
 ↓
Intent detection
 ↓
Question classification
 ↓
Follow-up detection
 ↓
Topic tracking
 ↓
Conversation memory
 ↓
Answer request
```

## Categories

Supported categories include:

- question;
- follow-up;
- clarification;
- correction;
- acknowledgement;
- statement;
- task;
- topic change.

## Question detection

Use linguistic and contextual signals. Punctuation alone is insufficient.

## Follow-up detection

A follow-up is interpreted relative to previous turns.

Example:

```text
Why did you choose PostgreSQL?
Why not MongoDB?
```

The second question inherits context from the first.

## Topic tracking

Topics receive identifiers and confidence. A topic transition should not erase useful recent context.

## Memory

Keep recent turns and summarize older content when necessary. Memory must be bounded.

## Confidence

Low-confidence classifications should not produce high-confidence UI claims.

## Privacy

Do not log raw transcript content by default.
