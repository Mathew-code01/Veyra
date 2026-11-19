# Veyra Architecture

This document describes the current code, not a promise that every subsystem
is production-ready. Status labels distinguish connected paths from intended
future work.

## System map

```text
client renderer
   │ window.veyra (allowlisted preload API)
   ▼
desktop IPC handlers ───── desktop/main/appLifecycle.ts
   │                          │
   │                          ├── core AI / interview / candidate / documents
   │                          ├── core context / memory / model / hardware
   │                          └── database repositories (SQLite)
   │
   └── shared contracts and event names

server/src
   └── Express control-plane routes
       └── injected identity, account, device, billing and cloud adapters
           (no production adapters are selected)
```

`core/` owns domain behavior and is not supposed to depend on Electron, the
renderer, or HTTP. `shared/` owns boundary contracts. `database/` owns SQLite
schemas, migrations, and repositories. `desktop/` composes those services and
guards access at the renderer boundary. `server/` is a separate HTTP control
plane; it does not share the desktop process or local database.

## Desktop responsibilities and lifecycle

The Electron main process initializes the local database and active profile,
constructs the model, AI, interview, candidate, document, memory, and context
services, then registers IPC handlers. Preload exposes only approved methods
through `window.veyra`; renderer code does not receive `ipcRenderer`, Node.js
APIs, database connections, credentials, or core service instances. Shutdown
removes registered handlers and disposes the model system/database.

The renderer currently has document and provider-settings workflows. Candidate
CRUD is exposed through preload but does not yet have a candidate-authoring
screen. A full interview overlay and preparation/practice UI remain future
work.

## Candidate data model

Candidate profiles and their experience, project, skill, and story records are
stored in SQLite tables keyed by the trusted application profile and candidate
ID. Candidate evidence has source/provenance fields and is separately scoped
to profile and candidate. Candidate-specific memories carry a candidate ID;
profile-wide preferences leave it null.

The renderer-facing candidate API supports list/get/save/delete for profiles
and list/get/save/delete for structured records. Main-process handlers require
an active profile, validate domain records, and ignore renderer-supplied
profile ownership. Candidate deletion transactionally removes its structured
records, evidence, candidate-specific memories, and context vectors whose
stored scope identifies that profile and candidate.

The current profile contract does not yet model every requested field (for
example, a complete career-goal/preferences model). There is no candidate
authoring UI.

## Document processing

The implemented import path is:

```text
Documents renderer
  -> window.veyra.document
  -> sender-bound, single-use picker handle
  -> main-process bounded file read
  -> DocumentService
  -> TXT / Markdown / HTML parser
  -> profile-scoped SQLite document store
  -> context indexer and candidate-evidence adapter
```

Deletion removes derived context and candidate evidence before deleting the
document record; a failed step leaves the durable record available for retry.
Supported production parsers are currently TXT, Markdown, and HTML. PDF and
DOCX parser abstractions are not connected to concrete production parsers.
Document import currently does not offer a complete candidate-association
workflow.

## Context and interview assembly

`CandidateContextBuilder` composes the durable profile, structured records,
and candidate evidence. The interview composition supplies that context through
an injected retrieval callback. `InterviewIntelligence` combines it with
profile/candidate-scoped vector retrieval and persistent memory, labels sources,
caps the assembled text, then passes it to `PromptService`.

The integration test `tests/integration/interview/candidate-context.test.ts`
uses real SQLite candidate/evidence repositories and verifies that candidate
facts reach prompt construction. It does not call a live model.

`SqliteVectorStore` persists vectors and filters scope before final ranking.
`OnnxEmbeddingService` requires a compatible tokenizer and only reports
semantic readiness after inference. The current composition has no configured
production tokenizer/model; semantic inference is therefore not verified and
the system must be treated as using fallback retrieval.

## Interview and practice lifecycle

The existing interview engine classifies interview tasks and the intelligence
service prepares prompts. Interview IPC can execute the prepared request
through `AIManager`. Candidate facts and memory now join the prompt context.
There is no complete persisted practice-session lifecycle for question
progression, candidate answers, feedback, resume, summaries, and performance
tracking. Domain-wide interview coverage, adaptive practice, and evidence-aware
answer evaluation are not verified end to end.

## Grammar and communication

Conversation detectors and answer-oriented services exist in `core/`, but a
complete, user-controlled grammar correction and communication-evaluation
workflow is not connected to a persisted practice session. No claim is made
that grammar corrections preserve intended facts across a production UI flow.

## Memory

`MemoryRepository` stores profile-scoped records in SQLite, uses FTS5 for
keyword search where configured, supports candidate filters, verification
status, and expiration, and is exposed by memory IPC. Interview composition
retrieves candidate/session/knowledge memories for the requested candidate and
profile-wide preferences separately. This path is covered by repository and
interview prompt tests; a memory management renderer workflow is not complete.

## Audio

`core/audio/` contains capture/transcription abstractions and local Whisper
components. Desktop audio device, permission, and session IPC are not wired into
the production lifecycle as a verified microphone-to-interview flow. Partial
transcripts are not demonstrated end to end.

## Vision

`core/vision/` contains capture, OCR, and analysis abstractions. A
permission-controlled production capture-to-interview path is not verified or
registered as a complete desktop workflow. Screenshot retention and
user-controlled capture UX remain outstanding.

## AI execution modes

The current composition registers a local model provider and cloud providers
behind `CloudGateway`. `CloudExecutionPolicy` is configured fail-closed:
external processing is disabled, the model catalog is empty, and there is no
durable quota ledger. Cloud generation and streaming therefore remain
unavailable. API-key presence is not authorization.

Provider credentials use the main-process credential boundary and the Settings
workflow. Execution-mode preferences are persisted, but the AI and interview
IPC paths still execute an explicitly requested provider through `AIManager`;
they are not connected to `AIRouter` policy based on the saved mode. Local,
BYOK, Veyra-cloud, and hybrid routing are not all production-verified. Do not
enable cloud inference until consent, model pricing, entitlement, quota, and
usage recording are implemented and tested.

## Server, identity, subscription, and billing

`server/src/` provides Express route and validation scaffolding with injected
interfaces for token verification, accounts, devices, billing, and cloud
execution. Production identity, persistence, billing provider, webhook
signature adapter, durable idempotency, and cloud authorization adapters have
not been selected or implemented. A request-body consent flag alone is not
sufficient authorization. The server is not a production account or billing
system.

## API contracts and privacy boundaries

Shared AI, interview, candidate-summary, document, and event contracts live in
`shared/`. Electron IPC request/result types are defined alongside handlers;
the renderer receives no database or provider objects. The local SQLite
database is profile-scoped but stored data is not uniformly encrypted at rest.
Cloud inference is disabled by default. Local `.env` configuration and local
database/model artifacts must not be copied into release artifacts.

There is no complete OpenAPI document or website-to-desktop service contract
verified in this implementation.

## Future transparent overlay integration

The future overlay should consume shared interview request/result contracts
through preload and should not call providers, database repositories, or
filesystem APIs directly. Audio and vision must feed the same
`InterviewIntelligence` pipeline rather than a parallel chatbot. The overlay,
continuous capture behavior, and final interaction design are intentionally
not implemented here.
