# Testing Strategy

## Layers

### Unit

Test pure logic:

- question detection;
- classification;
- prompt construction;
- ranking;
- retries;
- timeouts;
- sanitization.

### Integration

Test:

- AI manager/providers;
- transcription adapters;
- RAG/vector store;
- repositories/database;
- IPC/services.

### E2E

Cover:

1. startup;
2. profile setup;
3. document import;
4. interview setup;
5. permission flows;
6. live session;
7. question detection;
8. AI guidance;
9. session completion;
10. history;
11. settings.

## AI testing

Because model prose is probabilistic, assert:

- schema validity;
- required structures;
- safe fallback;
- unsupported-claim behavior;
- timeout handling;
- prompt-injection resistance.

Avoid brittle exact-string assertions.

## Fixtures

Never commit real credentials, private resumes, real interview transcripts, or private screenshots.

## Security tests

Include:

- malformed IPC;
- oversized requests;
- path traversal;
- invalid provider configuration;
- unauthorized resource access;
- secret leakage checks.

## CI

Minimum CI sequence:

```text
lint
typecheck
tests
build
```

E2E can run in a dedicated desktop-capable job.
