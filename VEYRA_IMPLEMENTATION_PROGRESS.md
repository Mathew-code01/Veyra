# VEYRA IMPLEMENTATION PROGRESS

**Project:** Veyra — Privacy-first AI interview copilot desktop application
**Root:** C:\Users\MATTHEW\Desktop\Veyra
**Branch:** main (HEAD `e90a6243348ace2ca58f1b531e1ad1cab404b2f2`; synchronized with `origin/main` on 2026-11-10)
**Remote:** https://github.com/Mathew-code01/Veyra

## STATUS
P0/P1 foundations remain partially implemented; production semantic retrieval
is unavailable by default. The current context fallback is keyword-only and
does not fabricate embeddings.

## INSTRUCTIONS PRESERVED
- Do NOT discard existing uncommitted working-tree changes (tsconfig fix and many others present before this work).
- Do NOT commit .env, secrets, models, databases, or personal documents.
- Stage only my own files; never stage the entire repository indiscriminately.
- Commit only coherent, tested changes; push to origin/main without force-push.

## EXECUTION PRIORITY
1. P0 — Central interview intelligence and actual AI execution [DONE]
2. P0 — Desktop backend connections [DONE]
3. P1 — Candidate intelligence / document processing [DONE]
4. P1 — Persistent memory + production local retrieval [DONE this stage]
5. P1 — SQLite persistence and data isolation [DONE this stage]
6. P2 — Local/cloud AI routing + free-usage enforcement
7. P2 — Hardware-aware model management + runtime validation
8. P2 — Voice transcription integration
9. P2 — Vision/multimodal integration
10. P3 — Security, privacy, reliability, server architecture
11. P4 — Additional intelligence capabilities
12. P5 — Full integration testing + production readiness

## COMPLETED TASKS

### TASK P0.2 — AI generation IPC
`desktop/ipc/ai.ipc.ts`, `desktop/main/appLifecycle.ts`, `desktop/preload/api.ts`, `desktop/preload/types.ts`.
`ai:generate` + `ai:provider-status` via validated IPC; exposed as `window.veyra.ai`.

### TASK P0.4 — Wire CandidateService + ContextManager into appLifecycle
`desktop/main/appLifecycle.ts`. Candidate + context injected into InterviewIntelligence; getters added.

### TASK P0.3/P1.1 — Interview IPC (analyze + execute)
`desktop/ipc/interview.ipc.ts`, appLifecycle, preload api/types. `interview:analyze`/`:task`/`:classify`/`:guidance` executing analysis → candidate → context → prompt → AIRequest → AI execution; exposed as `window.veyra.interview`.

### TASK P1 — Document intelligence / candidate document processing
- `core/documents/storage/InMemoryDocumentStore.ts` (new)
- `core/documents/storage/DocumentStore.ts` (added `list()`)
- `core/documents/DocumentService.ts` (added `getDocumentById`, `deleteDocument`, `listDocuments`, `requireDocumentStore`)
- `desktop/ipc/document.ipc.ts` (new): `DOCUMENT_PICK`/`:import`/`:read`/`:delete`/`:list`
- `desktop/main/appLifecycle.ts`: DocumentService wired + `getDocumentService()`
- `desktop/preload/api.ts`, `desktop/preload/types.ts`: `window.veyra.document`
- `shared/constants/events.ts`: added `DOCUMENT_IMPORT`

### TASK P1 — Persistent memory + production local retrieval (this stage)
- `database/schema/memory.ts` (new): `memories` table (candidate/conversation/session/preference/knowledge), profile-scoped, with source tracing, confidence, verification status, timestamps, expiration.
- `database/migrations/0001_memory.sql` (new): `memories` + `context_vectors` tables + indexes.
- `database/schema/index.ts`: export memory schema.
- `database/repositories/memoryRepository.ts` (new): create/get/list/search/update/soft-delete/hard-delete/expire, all profile-isolated; LIKE-based keyword search (offline, no API key).
- `database/repositories/documentRepository.ts`: added `setStatus`, `listAll`; `create` honors a caller-supplied id.
- `core/documents/storage/SqliteDocumentStore.ts` (new): SQLite-backed DocumentStore using DocumentRepository; profile-scoped reads/writes; survives restart.
- `core/documents/DocumentService.ts`: sets `profileId` from `request.candidateId` before save.
- `core/documents/storage/DocumentStore.ts`: no contract change needed.
- `core/context/embeddings/OnnxEmbeddingService.ts` (new): real local embedding via onnxruntime-node (mean-pool + L2-normalize); requires a model file (PARTIALLY VERIFIED — no model bundled).
- `core/context/storage/SqliteVectorStore.ts` (new): persistent SQLite vector store (JSON vectors, cosine similarity in JS, metadata/source/profile filtering); no external extension.
- `core/context/createContextEngine.ts`: uses OnnxEmbeddingService only when a model file and compatible tokenizer are supplied; otherwise it stores text with an empty vector marked `keyword-only` and retrieves lexically. The current desktop lifecycle supplies no tokenizer, so production composition is keyword-only. No mock vectors are generated in production. Semantic readiness is false until a successful ONNX inference.
- `desktop/main/appLifecycle.ts`: SqliteDocumentStore replaces InMemoryDocumentStore; MemoryRepository constructed; memory IPC registered; `getMemoryRepository()` getter.
- `desktop/ipc/memory.ipc.ts` (new): `MEMORY_SEARCH`/`:list`/`:create`/`:update`/`:delete`, all profile-scoped.
- `desktop/preload/api.ts`, `desktop/preload/types.ts`: `window.veyra.memory`.
- `shared/constants/events.ts`: added `MEMORY_SEARCH`/`MEMORY_LIST`/`MEMORY_CREATE`/`MEMORY_UPDATE`/`MEMORY_DELETE`.
- `database/client.ts`: added `overrideDatabaseForTesting` for isolated tests.
- `tests/helpers/database.ts` (new): fresh migrated DB per test.

### TESTS
Files added:
- `tests/unit/database/memory-repository.test.ts`: 10 tests — pass (create/retrieve, missing, profile isolation, category filter, update, soft-delete, FTS5-like keyword search, minConfidence, expiration).
- `tests/unit/database/document-store.test.ts`: 8 tests — pass (store/retrieve, profile isolation, restart persistence, status update, delete, missing, no-profileId throw).
- `tests/unit/context/vector-store.test.ts`: 9 tests — pass (cosine similarity, source/scope/model filtering, lexical fallback, restart persistence, deletion, and vector validation).
- `tests/unit/context/keyword-retrieval.test.ts`: verifies indexing and retrieval do not call the mock embedding methods when semantic embeddings are unavailable.
- `tests/unit/context/onnx-embedding.test.ts`: 6 tests — pass (missing-model error, model id/dims, invalid input, cancellation; semantic inference PARTIALLY VERIFIED — no model bundled).
- `tests/unit/desktop/memory-ipc.test.ts`: 11 tests — pass (registration, search/list/create/update/delete, profile validation, sender-destroyed, cleanup).
- `tests/unit/desktop/ai-ipc.test.ts`: 9 tests — pass.
- `tests/unit/desktop/interview-ipc.test.ts`: 9 tests — pass.
- `tests/unit/desktop/document-ipc.test.ts`: 13 tests — pass.
Results: 93/93 tests pass across 14 files. `tsc -b` passes.
Lint: eslint cannot run (pre-existing missing `eslint-plugin-react-hooks` package; unrelated).

### RETRIEVAL MODE SUPPORT (honest status)
- Keyword (LIKE) search over memories/documents: VERIFIED (offline, no API key).
- Persistent vector storage (SqliteVectorStore): VERIFIED.
- Semantic embedding via OnnxEmbeddingService: PARTIALLY VERIFIED (real onnxruntime-node implementation; constructor validates model file; no model file bundled so inference cannot be exercised in test env).
- Hybrid retrieval: semantic via SqliteVectorStore + keyword via MemoryRepository LIKE; both profile-isolated.

## REMAINING ISSUES
- Candidate stores are in-memory (P1 SQLite repositories not yet done).
- Persistent cloud quota accounting and user-facing external-processing authorization are not yet wired.
- The default cloud policy has no model classifications configured, so cloud inference remains disabled.
- Local-first hardware routing, Nebius verification, voice, and vision integration remain unfinished.
- Semantic embedding inference cannot be exercised without a bundled ONNX model (PARTIALLY VERIFIED).

## P2 EXECUTION POLICY UPDATE — 2026-11-09

Status: PARTIALLY VERIFIED.

- `CloudGateway` now applies one execution policy to generated and streamed cloud requests before provider transport.
- External processing requires explicit policy permission, and the exact provider/model pair must be classified `FREE_CONFIRMED` or `FREE_QUOTA_LIMITED` with a working quota ledger.
- `PAID`, `UNKNOWN`, `DISABLED`, missing model IDs, and unauthorized external processing fail closed.
- `FREE_QUOTA_LIMITED` requires an injected quota ledger; quota exhaustion or ledger failure blocks the request.
- Production currently uses the deny-by-default policy. No free model is asserted by catalog metadata, and no durable quota ledger is wired.
- Verification: 12 policy tests pass; `npm test` passes 105/105. `npm run typecheck` and direct core/desktop TypeScript checks pass.
- No real provider requests were made.

## NEXT EXACT TASK
Implement and persistently wire a quota ledger and explicit privacy authorization before enabling any free cloud model. Then complete local-first routing and verify provider/model pricing using authoritative quota information.

## COMMITS
- 9b6cbdb feat(desktop): connect AI and interview IPC services
- 896d3f3 feat(desktop): connect document IPC services
- 0e95b8b feat(database): persistent memory + production local retrieval

## PUSH STATUS
All commits pushed to origin/main (d0fa7ed). Working tree clean relative to
my work; pre-existing uncommitted modifications intentionally left untouched.

## IMPLEMENTATION FOLLOW-UP — MIGRATIONS AND DOCUMENT BOUNDARIES

This section records the later local implementation pass; it does not replace
the historical status above. No files were staged, committed, or pushed.

- `database/client.ts` now records applied SQL migrations with SHA-256
  checksums, applies each migration and its ledger row transactionally,
  rejects changed/missing applied migrations, checks required tables, and
  runs `foreign_key_check`. Initialization closes SQLite when migration
  validation fails.
- `database/migrations/0000_initial.sql` supplies the base schema and is now
  tracked with migrations `0001`–`0007` by commit
  `da7091786974d87c8d0c20393dea4455281a81a2`. Migration tests exercise fresh
  temporary databases; a packaged Electron startup was not performed.
- Document selection now keeps filesystem paths in the main process. The
  picker returns per-window opaque handles and filenames; a handle is
  single-use, and import reads at most 25 MiB in the main process. Renderer
  paths not obtained from the picker are rejected. The preload result type is
  updated accordingly.
- `SqliteDocumentStore` maps parser byte-size metadata correctly and requires
  profile scope for deletion. `DocumentService` checks delete scope before
  removing context/evidence, then deletes persisted content.
- Document-derived candidate evidence has a source-removal contract and
  adapter implementation. The production evidence store remains in-memory.
- Focused verification after the migration-test fixture correction:
  `npx vitest run tests/unit/database/migrations.test.ts
  tests/unit/database/document-store.test.ts
  tests/unit/desktop/document-ipc.test.ts
  tests/unit/documents/document-service-delete.test.ts --testTimeout=120000
  --pool=forks --maxWorkers=1` — 4 files, 30 tests passed.
- The prior 105/105 full-suite result predates these changes and is not a
  current full-suite result. The current full suite passed 115/115 tests;
  `npm run typecheck` passed after the final edits, and `npm run build`
  completed successfully.

### Remaining implementation blockers

- `desktop/main/appLifecycle.ts` constructs `new SqliteDocumentStore()`
  without an active-profile resolver. This intentionally makes production
  document deletion fail closed; trusted active-profile ownership must be
  wired before deletion is usable. Imports also require a candidate/profile
  ID to persist.
- Production document parsing still registers only text, HTML, and Markdown;
  PDF/DOCX parsers are not wired. No durable candidate-evidence store or
  interview memory retrieval was added in this pass.
- BYOK/secure credential storage, provider routing, local model lifecycle,
  voice/vision integration, and the remaining renderer work are not complete.
- `.env.example` contains non-empty credential-looking assignments; values
  were withheld and the file was not modified. See the implementation report
  for variable names and line numbers.

## CONTINUATION UPDATE — 2026-11-10

The preceding status above is historical. This continuation adds:

- Profile-scoped SQLite candidate CRUD through `candidate:*` IPC channels and
  the allowlisted `window.veyra.candidate` preload API. Candidate deletion
  transactionally removes candidate records, candidate evidence,
  candidate-scoped memories, and matching scoped context vectors.
- Interview prompt assembly now retrieves the durable candidate context
  alongside generic context and persistent memory, retaining candidate
  evidence IDs as prompt-source metadata.
- A real-SQLite IPC integration test verifies candidate profile isolation,
  record persistence, and cleanup. A separate real-SQLite interview
  integration test verifies persisted profile, experience, and document
  evidence reach prompt construction.
- The accidentally appended prompt text and one credential-looking raw line
  were removed from `.env.example`. The value was accidentally displayed in a
  verification tool output; it is not reproduced here. Treat it as exposed
  and rotate it if genuine. The local `.env` file was not read or modified.

Current verification for this continuation:

- `.\node_modules\.bin\vitest.cmd run --pool=forks --maxWorkers=1 --testTimeout=120000`
  — passed, 175 tests across 29 files.
- `.\node_modules\.bin\tsc.cmd -b --pretty false` — passed.
- `npm run build:client` — passed.
- `npm run build:electron` — passed and copied the local migration assets.
- `npm --prefix server test` — passed, 7 server boundary tests.
- `git diff --check` — passed after whitespace normalization.

Migration SQL sources are now tracked; clean-clone packaged startup remains
unverified. Other blockers still apply: PDF/DOCX production parsers, candidate
authoring UI, complete practice/session lifecycle, audio/vision runtime wiring,
execution-mode-aware AI routing, production cloud authorization/quota, and real
server identity and billing adapters are not complete. See
`VEYRA_UNIFIED_IMPLEMENTATION_AND_VERIFICATION_REPORT.md`.

## CURRENT FOLLOW-UP — Honest Context Retrieval Fallback

The production context factory no longer selects `MockEmbeddingService`.
Without both a model file and an injected compatible tokenizer it stores
text-only records marked `embeddingModel: "keyword-only"` and uses token
overlap retrieval with the existing profile/candidate scope filters.
Keyword-only vectors are empty; semantic vector search continues to reject
empty query vectors. Semantic search also filters stored vectors by the exact
model identifier used for the query to prevent cross-model comparisons.

The desktop lifecycle currently calls `createContextEngine()` without a
tokenizer, so the default app path is keyword-only even if a model path is set.
No compatible tokenizer/model was configured and no real ONNX inference was
performed. `semanticAvailable` remains false until a successful ONNX inference.

Current verification:

- `.\node_modules\.bin\vitest.cmd run --pool=forks --maxWorkers=1 --testTimeout=120000`
  — passed, 30 files and 178 tests.
- `npm test -- tests/unit/context tests/integration/documents/desktop-document-import.test.ts`
  — passed, 4 files and 19 tests.
- `npm run typecheck` — passed as part of the production build.
- `npm run build` — passed (typecheck, Vite renderer, Electron compile, and
  migration asset copy).
- `.\node_modules\.bin\prettier.cmd --check core/context/storage/KeywordSearch.ts tests/unit/context/keyword-retrieval.test.ts`
  — passed.
- `git fetch origin main` — succeeded; local `main` and `origin/main` are both
  `e90a6243348ace2ca58f1b531e1ad1cab404b2f2` (0 ahead / 0 behind).
- The index is clean; 94 paths remain modified/deleted/untracked in the
  worktree and were not staged. Existing data artifacts were preserved.

Next exact task: supply an authorized, model-compatible tokenizer through the
desktop composition, then verify a successful local ONNX inference and
cross-model filtering with a real model bundle. Keep keyword-only retrieval as
the default until that evidence exists.

## Independent continuation update — 2026-11-13

The previous status snapshot above is historical. Current branch is
`feat/veyra-phases-12-22`, tracking `origin/feat/veyra-phases-12-22`, at
`cbf5fbf`; it is 0 ahead / 0 behind its upstream and 35 commits ahead of
`origin/main`.

### Completed and delivered

- `1a32f2a91c5b9641727a34eed7d6b25b065913b2`
  (`test(db): verify packaged migrations initialize clean database`) pushed.
  Added a temporary package-layout migration-copy test using actual SQLite,
  made the copy script import-safe/testable, and increased the slow legacy
  migration test timeout to 120 seconds after one 60-second timeout.
- `83c890bca4d46e87d8ac752cacda866e21d677cf`
  (`fix(audio): disable mock transcription in production IPC`) pushed. Audio
  runtime IPC no longer invents mock transcript output when no adapter is
  configured; it returns an explicit unavailable error before capture.
- `cbf5fbf` (`docs: publish independent Veyra phase verification`) pushed.
- Do not stage existing overlay/UI edits, recovery/session repository changes,
  `.env.example`, local DB files, or unrelated reports.

### Verification

- `npm test` — PASS, 56 files / 315 tests.
- `npm --prefix server test` — PASS, 7 tests.
- Audio-focused tests — PASS, 4 files / 16 tests.
- Changed audio IPC/test isolated strict TypeScript check — PASS.
- `npm run typecheck` — FAILS on current unrelated dirty edits:
  `core/reliability/SessionRecoveryManager.ts` has unresolved relative imports
  and an implicit-any result; `desktop/main/appLifecycle.ts` assigns to the
  imported `cleanupOverlayIpc`. These files were left untouched.
- `npm run build:electron` passed after the migration change but before the
  current typecheck blockers were observed. `npm run build:client` passed;
  no UI build/runtime claim is made after the latest worktree state.
- No production server, paid/cloud provider, real microphone, vision model,
  ONNX model, or Electron window was launched.

### Audit conclusions and next task

- Migration SQL files 0000–0007 are tracked, build-copy is tested, and
  migration initialization uses temporary real SQLite. Clean-clone packaged
  Electron startup remains unverified. `client/package-lock.json` is tracked
  in HEAD but deleted in the worktree; separate client-install support is
  unresolved.
- Candidate/document, practice, memory, and interview foundations are
  partially implemented and have selected real-SQLite integration tests.
  PDF/DOCX parsing, semantic ONNX inference, full communication workflows,
  and real audio/vision remain incomplete.
- `AIRouter` is not wired into the production application call sites.
  Execution-mode preferences are persisted but do not control routing.
  Production CloudExecutionPolicy remains fail-closed (no user-facing consent
  hookup, model classifications, or durable quota ledger).
- The server is an injected Express/Zod control-plane scaffold, not a
  production account/billing/cloud service. `/api/v1/ai/stream` intentionally
  returns 503.
- Redacted scanning found credential-shaped values only in the current dirty
  `.env.example`: an unassigned Google API-key-shaped literal at line 1645 and
  `JAVIS_MAIN_KEY` at line 1651. Validity is unknown; values were not copied
  here, and the file was not edited or committed.

Next exact task: fix the current typecheck blockers with owner approval, then
wire persisted execution mode and preferred model into the existing
`AIRouter`/central AI execution path while keeping cloud denied until explicit
user-facing external-processing consent, complete pricing classifications,
and durable quotas are implemented.

## Latest continuation — workspace profile onboarding

The current branch remains `feat/veyra-phases-12-22` at
`cbf5fbf71733a76a002d710f831ae90ab1772d5a`. The existing worktree changes were
preserved.

- Investigated why the live-session setup failed with “An active candidate
  profile is required.” When more than one local workspace profile exists,
  startup intentionally leaves the active profile unset; there was no UI to
  choose one. The candidate-profile page also had no creation flow.
- Added validated workspace-profile IPC for listing summaries, activating an
  existing profile, and creating the initial profile only when none exist.
  Selection updates the trusted main-process `ActiveProfileService`; renderer
  IDs are checked against the repository before activation.
- Added workspace selection and candidate-profile creation to the Profile
  page. Candidate name is required; headline and summary are optional, and no
  experience or personal history is fabricated.
- `npm test -- tests/unit/desktop/workspace-profile-ipc.test.ts` — PASS
  (1 file, 4 tests).
- `npm run build:client` — PASS.
- `npm run build:electron` — PASS.
- `.\node_modules\.bin\tsc.cmd -p .\tsconfig.client.json --noEmit` — PASS.
- Full `npm run typecheck` was started but stopped after it remained running
  without output; the targeted client check and Electron build completed.
- The new onboarding flow has not yet been exercised in the running Electron
  window. No workspace was selected and no candidate details were entered;
  restart the app to load the rebuilt preload, then choose the intended local
  workspace and provide candidate details before continuing live-session
  verification.
