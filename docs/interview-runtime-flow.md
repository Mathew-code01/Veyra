# Veyra Interview Runtime Flow (Current)

## Canonical orchestration (Phase 9)
- **Runtime:** `core/interview/runtime/UnifiedInterviewRuntime.ts`
- **Intelligence:** reuses `core/interview/services/InterviewIntelligence.ts` (domain classification, question understanding, answer planning/evaluation, communication feedback, follow-ups) and `core/conversation/services/ConversationAnalyzer.ts`.
- **Persistence:** `SessionRepository`, `QuestionRepository`, `AnswerRepository`, optional `MemoryRepository` (SQLite/profile-scoped). Session settings store additive runtime metadata (`interviewMode`, `candidateId`, `cancellationReason`).
- **Context/evidence:** optional `ContextManager` query + injected `retrieveCandidateContext(profileId,candidateId,query)` hook + memory search; results surfaced as typed evidence with provenance (`candidateEvidenceIds`, `memoryIds`, `contextIds`, `factsGrounded`, assumptions, missing information).
- **AI boundary:** optional injected `AIManager.generate` (local/BYOK/cloud routing owned by existing AI/policy layers). Runtime never makes paid/provider calls directly in tests; failures/timeouts returned as unavailable (no silent fallback).

## Lifecycle
1. `createSession(config)` → persists draft session (practice/live, role/domain/JD/question count).
2. `startSession` / `pauseSession` / `resumeSession` / `cancelSession` / `completeSession` → status transitions with profile isolation checks and persisted settings/report on completion.
3. `processQuestion({sessionId,text,source})` → builds `ConversationAnalysis`, runs intelligence/classification/understanding/planning/follow-ups, retrieves evidence, persists question, optionally requests AI guidance, returns `InterviewRuntimeResponse`.
4. `submitAnswer({sessionId,questionId,answerText})` → evaluates/analyses communication/follow-ups, persists answer+evaluation payload, completes practice session when thresholds met, returns `InterviewRuntimeAnswerResult`.

## Desktop integration
- **IPC:** `desktop/ipc/interview-runtime.ipc.ts` (`runtime:*` channels in `shared/constants/events.ts`), sender-destroyed checks and active-profile requirement.
- **Lifecycle:** `desktop/main/appLifecycle.ts` constructs `UnifiedInterviewRuntime` with shared repos/intelligence/memory/context/AI manager and registers IPC.
- **Preload:** `window.veyra.runtime.*` and `window.veyra.practice.*` in `desktop/preload/api.ts`/`types.ts`.
- **UI:** `InterviewSetup`/`Preparation` create+start sessions; `QuestionPractice` uses practice engine IPC for adaptive Q/A/eval/report; `LiveInterview` submits typed/transcript text to runtime and shows grounded guidance/provenance with explicit user-initiated audio/capture controls; `History`/`SessionDetails` read persisted sessions/reports.

## Server/cloud contract (Phase 10)
- `POST /api/v1/interview/execute` in `server/src/app.ts`: authenticated, strict schema, explicit `externalProcessingConsent`, idempotency, BYOK/secret-field rejection, fail-closed 503 when `interviewGateway` DI not configured. Gateway types in `server/src/cloudGateway.ts`.

## Status/limits
- Runtime and key IPC/server/UI slices are **PARTIALLY VERIFIED** by focused tests/typechecks; real hardware capture/transcription, vision inference, and authorized cloud/provider execution remain **BLOCKED/NOT TESTED**.
