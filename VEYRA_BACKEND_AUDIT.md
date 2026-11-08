# VEYRA BACKEND AUDIT — ENGINEERING HANDOFF

**Project:** Veyra — Privacy-first AI interview copilot desktop application  
**Audit scope:** `core/`, `shared/`, `desktop/`, `database/`, `server/` (read-only investigation)  
**Status:** Audit complete. Implementation roadmap included.  
**Report date:** 2026-11-08

---

## 1. EXECUTIVE SUMMARY

### Current backend maturity
Veyra is a substantial, partially-integrated TypeScript monorepo (Electron desktop + Node server + shared contracts + core business logic). The core subsystems are well-factored and internally coherent, but several critical connections are missing or unwired, most notably the desktop IPC surface for AI/interview/document/context/vision and the execution step of the interview pipeline (AIRequest is prepared but not executed by InterviewIntelligence).

### What Veyra already has
- **AI layer**: `AIManager` with `LocalModelProvider`, `CloudAIProvider`, `AIRouter`, `AIExecutionStrategy`, cloud provider adapters (Gemini, Groq, Mistral, HuggingFace, Cerebras, OpenRouter), `CloudGateway`, `CloudProviderRegistry`.
- **Reliability layer**: Full `ReliabilityManager` with operation lifecycle, timeout, retry, backoff, recovery, failure classification, health checks, and discriminated-union results (`ReliabilityExecutionSuccess` / `ReliabilityExecutionFailure`).
- **Interview layer**: `InterviewEngine` (classification, 10 task engines, answer builder), `InterviewIntelligence` (orchestrates interview analysis + candidate + context + prompt, produces `AIRequest` but does NOT execute it).
- **Prompt layer**: `PromptService` with builders (Interview/System/Vision), registry, normalizer, templates, `toAIRequest()` converter.
- **Context layer**: `ContextManager` with parser/chunker/embedding/vector-store/retriever/ranker/compressor pipeline; `createContextEngine()` composition root (uses `MockEmbeddingService` + `InMemoryVectorStore` — dev-only).
- **Candidate layer**: `CandidateService`, `CandidateContextBuilder`, evidence store, document-evidence adapter, profile/experience/project/skill/story stores.
- **Document layer**: `DocumentService`, `DocumentPipeline` (validate/classify/parse/normalize/chunk/index/store), parsers (PDF/DOCX/HTML/Markdown/Text), `DocumentAIAnalyzer` abstraction (not wired to a real AI provider by default).
- **Audio layer**: `AudioCapture` (abstract base, no mediaDevices access), `TranscriptionEngine`, `TranscriptAssembler`, `AudioTranscriptionPipeline`, `LocalWhisperProvider`, `WhisperEngine`, `VoiceActivityDetector`, `SpeakerSegmenter`, `AudioTranscriptPublisher`, `AudioContextPublisher`.
- **Vision layer**: `VisionPipeline`, `VisionAnalyzer`, `CaptureEngine`, `OCRService`, `ContentClassifier`, `VisionProvider` (abstract), `AIManagerVisionProvider`, `VisionContextIndexer`.
- **Model layer**: `ModelSystem` composition root, `ModelManager`, `ModelRegistry`, `ModelSelector`, `ModelCompatibility`, `ModelBenchmark`, `ModelInstallationManager`, `ModelRuntimeManager`, runtimes (Kokoro, LlamaCpp, WhisperCpp, Onnx), integrity service, download queue, recovery service.
- **Hardware layer**: `HardwareProfiler` (OS/CPU/RAM/GPU/VRAM/storage/acceleration/load via `systeminformation`), `HardwareTierSelector`, `SystemLoadMonitor`, `HardwareService` (desktop-boundary DTO conversion).
- **Security layer**: `SecretsManager`, `Encryption`, `PrivacyManager`, `SecureDelete`, `DataSanitizer`, `InputSanitizer`, authorization/policy/audit contracts.
- **Analytics layer**: `AnalyticsManager`, event bus, metrics, tracing, performance/reporting.
- **Desktop**: Electron main process (`index.ts`, `appLifecycle.ts`, `windowManager.ts`, `ModelSystem.ts`), IPC handlers (hardware, window, app, session, settings, capture, overlay, vision), preload API exposing `window.veyra` (app/window/hardware only).
- **Database**: `better-sqlite3` + `drizzle-orm`, schema (profiles, experiences, projects, skills, stories, documents, captures, transcripts, questions, answers, sessions, companies, metrics), migrations folder (one initial migration present), repositories (document, profile, project, session, story).
- **Server**: Express-style app with routes/controllers/services for AI, analytics, documents, profiles, projects, sessions, stories; middleware (error, rateLimit, security, validation); config (ai, database, env).
- **Tests**: Unit tests for analytics, security, hardware, audio, context, conversation, vision, AI; integration tests for ai-pipeline, audio-pipeline, database, rag-pipeline, vision-pipeline; e2e for interview/preparation/settings; fixtures for images/questions/resumes/transcripts.

### Biggest architectural strengths
- Clean separation of concerns: core business logic has no knowledge of desktop/server/IPC.
- `shared/` contracts are used consistently across core/desktop/server.
- Reliability is a real, domain-neutral subsystem (not bolted on per-service).
- Interview orchestration deliberately separates preparation (`InterviewIntelligence`) from execution (`core/ai`).
- Model lifecycle (install → integrity → runtime → readiness) is explicitly modeled.
- Security boundary at preload: renderer only receives whitelisted IPC, no Node/Electron internals.

### Biggest architectural weaknesses
- **Desktop IPC is incomplete**: Only hardware, window, app, session, settings, capture, overlay, and vision channels are registered. AI (`ai:generate`, `ai:stream:*`, `ai:provider-status`), interview (`interview:analyze`, `interview:task`, `interview:guidance`), document (`document:pick/read/delete/list`), and context (`context:*`) channels exist in `shared/constants/events.ts` but have **no handlers** in `desktop/main/index.ts` and **no exposure** in `desktop/preload/api.ts`.
- **Interview pipeline is not executed end-to-end**: `InterviewIntelligence.analyzeForAI()` builds a canonical `AIRequest` and returns it, but does not call `AIManager.generate()`. The caller (desktop IPC or server) must wire preparation → execution itself. No desktop consumer currently does this.
- **Desktop app lifecycle does not initialize interview/document/context services**: `appLifecycle.ts` wires `ModelSystem`, `AIManager`, `InterviewIntelligence`, `HardwareService`, `AnalyticsManager`, and database, but `InterviewIntelligence` is constructed without `CandidateService` or `ContextManager`, so candidate/context enrichment is a no-op at runtime.
- **Context layer uses dev-only infrastructure**: `createContextEngine()` uses `MockEmbeddingService` (deterministic hash embeddings) and `InMemoryVectorStore`; no persistent production embedding/vector store is wired.
- **Document AI analysis is behind an abstraction**: `DocumentService` accepts an injected `DocumentAIAnalyzer`; no default implementation connects it to `AIManager`.
- **TypeScript config issue**: `tsconfig.client.json` uses deprecated `baseUrl` + `ignoreDeprecations: "6.0"` (TS 6.0.3 installed), triggering TS5101. Fixed in working tree but not yet committed.
- **No server↔desktop IPC bridge**: Server has its own routes/controllers but there is no evidence desktop services call server endpoints, nor that server uses desktop core services.

### Most important missing functionality
1. Desktop IPC handlers + preload exposure for AI generation, interview analysis/task, document read/list, and context query.
2. End-to-end interview execution: wire `InterviewIntelligence` output (`AIRequest`) → `AIManager.generate()` → return `AIResponse` to desktop consumer.
3. Runtime wiring of `CandidateService` + `ContextManager` into `InterviewIntelligence` in `appLifecycle.ts`.
4. Production embedding + vector store replacement for `MockEmbeddingService`/`InMemoryVectorStore`.
5. Document AI analysis default implementation connecting `DocumentService` → `AIManager`.

---

## 2. ACTUAL ARCHITECTURE

### Verified folder structure

```
core/
  ai/              AIManager, AIProvider, AIRequest, AIResponse, AIError,
                   AIRouter, AIExecutionStrategy, AIExecutionPlan,
                   LocalModelProvider, CloudAIProvider, CloudGateway
  analytics/       AnalyticsManager, metrics, events, tracing, performance
  audio/           AudioCapture (abstract), TranscriptionEngine,
                   TranscriptAssembler, AudioTranscriptionPipeline,
                   LocalWhisperProvider, WhisperEngine, VoiceActivityDetector,
                   SpeakerSegmenter, AudioTranscriptPublisher, AudioContextPublisher
  candidate/       CandidateService, CandidateContextBuilder, stores,
                   evidence store/retrieval, document-evidence adapter
  cloud/           CloudProvider, CloudGateway, CloudHttpClient, providers (Gemini, Groq,
                   Mistral, HuggingFace, Cerebras, OpenRouter), registry, capabilities
  context/         ContextManager, ContextParser, Chunker, EmbeddingService (Mock),
                   VectorStore (InMemory), Retriever, Ranker, Compressor,
                   createContextEngine
  conversation/    ConversationManager, ConversationAnalyzer, ConversationMemory,
                   detectors (Question, FollowUp, Clarification, Repetition, Intent)
  documents/       DocumentService, DocumentPipeline, parsers (PDF/DOCX/HTML/MD/Text),
                   normalizer, chunker, classifier, indexer, storage, validators,
                   DocumentAIAnalyzer (abstraction), DocumentContextSink
  errors/          Shared error base classes
  hardware/        HardwareProfiler, HardwareProfile, HardwareTierSelector,
                   AccelerationDetector, SystemLoadMonitor
  interview/       InterviewEngine, InterviewIntelligence, 10 task engines,
                   AnswerBuilder, validators, classifiers
  models/          ModelSystem, ModelManager, ModelRegistry, ModelSelector,
                   ModelCompatibility, ModelBenchmark, installation/ (queue, manager,
                   plan, policy, lock, guards), runtime/ (runtimes, registry, manager,
                   downloader, installer), storage/ (integrity, manifest, paths, storage,
                   recovery)
  prompts/         PromptService, PromptRegistry, builders (Interview/System/Vision),
                   normalizer, templates (interview/system/vision)
  reliability/     ReliabilityManager, retry, timeout, circuit, recovery, health,
                   execution (OperationManager), contracts, errors
  security/        SecretsManager, Encryption, PrivacyManager, SecureDelete,
                   DataSanitizer, InputSanitizer, authorization, identity, privacy,
                   audit contracts
  vision/          VisionPipeline, VisionAnalyzer, CaptureEngine, OCRService,
                   ContentClassifier, providers (VisionProvider abstract,
                   AIManagerVisionProvider), processing, contracts
shared/
  constants/       events.ts (IPC_CHANNELS, IPC_EVENTS), interviewTypes.ts,
                   modelNames.ts
  contracts/       ai.contract.ts, audio.contract.ts, candidate.contract.ts,
                   conversation.contract.ts, document.contract.ts, hardware.contract.ts,
                   interview.contract.ts, profile.contract.ts, session.contract.ts,
                   vision.contract.ts
  types/           ai.ts, audio.ts, candidate.ts, capture.ts, common.ts,
                   conversation.ts, documents.ts, hardware.ts, interviews.ts,
                   sessions.ts, vision.ts
  validation/      aiSchemas, candidateSchemas, conversationSchemas, documentSchemas,
                   interviewSchemas, profileSchemas, sessionSchemas, visionSchemas
desktop/
  main/            index.ts (bootstrap), appLifecycle.ts (service composition),
                   windowManager.ts, ModelSystem.ts, permissions.ts, shortcuts.ts,
                   tray.ts, updater.ts, crashReporter.ts
  ipc/             ai.ipc.ts (EMPTY), audio.ipc.ts, capture.ipc.ts, context.ipc.ts,
                   document.ipc.ts, hardware.ipc.ts (IMPLEMENTED), overlay.ipc.ts,
                   session.ipc.ts, settings.ipc.ts, vision.ipc.ts
                   (no interview.ipc.ts)
  preload/         index.ts, api.ts (exposes app/window/hardware only), types.ts
  services/        ai/HardwareService.ts, models/ModelSystem.ts
database/
  client.ts        better-sqlite3 + drizzle, createDatabase/getDatabase/closeDatabase,
                   withTransaction, runMigrations
  migrations/      0000_initial.sql
  repositories/    document, profile, project, session, story
  schema/          answers, captures, companies, documents, experiences, index,
                   metrics, profiles, projects, questions, sessions, skills, stories,
                   transcripts, _shared
server/
  src/             app.ts, server.ts, config (ai/database/env), controllers,
                   middleware, repositories, routes, services, utils
tests/             unit/, integration/, e2e/, fixtures/, mocks/
```

### Entry points
- `desktop/main/index.ts` — Electron bootstrap: `app.whenReady()` → `initializeApplication()` → `registerIPC()` → `createMainWindow()`.
- `desktop/main/appLifecycle.ts` — Service composition root: database, `ModelSystem`, `ReliabilityManager`, `AIManager` (registers local + cloud providers), `PromptService`, `InterviewIntelligence`, `HardwareService`, hardware IPC.
- `server/src/app.ts` / `server/src/server.ts` — HTTP server entry.
- `tests/` — vitest entry via `vitest.config.ts`.

### Main services and dependency relationships

| Service | Responsibility | Depends on | Used by |
|---|---|---|---|
| `AIManager` | Provider registration, generate/stream, health | `ReliabilityManager`, `ModelManager`, `CloudGateway`, `CloudProviderRegistry` | `appLifecycle`, `InterviewIntelligence` (indirectly via caller) |
| `LocalModelProvider` | Local AI generation via `ModelManager` | `ModelManager` | `AIManager.registerLocalModelProvider` |
| `CloudAIProvider` | Cloud AI generation via `CloudGateway` | `CloudGateway`, `CloudProviderRegistry` | `AIManager.registerCloudAIProvider` |
| `AIRouter` / `AIExecutionStrategy` | Provider selection, planning, execution with fallback | `AIManager` | Core AI execution path |
| `ReliabilityManager` | Operation lifecycle, timeout, retry, recovery, health | internal sub-managers | `AIManager`, `ModelManager`, `InterviewIntelligence` |
| `InterviewEngine` | Classification, task detection, answer guidance | `InterviewValidator`, `InterviewClassifier`, `AnswerBuilder`, task engines | `InterviewIntelligence` |
| `InterviewIntelligence` | Interview prep: engine → candidate → context → prompt → AIRequest | `InterviewEngine`, `CandidateServiceContract`, `ContextManager`, `PromptService`, `ReliabilityManager` | `appLifecycle` (constructed w/o candidate/context) |
| `PromptService` | Prompt construction → `AIRequest` | `PromptRegistry`, builders, normalizer | `InterviewIntelligence` |
| `ContextManager` | Ingest → embed → store → retrieve → compress | `ContextParser`, `Chunker`, `EmbeddingService`, `ContextStore`, `Retriever`, `Ranker`, `Compressor` | `InterviewIntelligence` (injected but not wired in appLifecycle) |
| `DocumentService` | Ingest → classify → parse → normalize → chunk → index → store | injected parsers, validator, classifier, normalizer, chunker, indexer, store | Desktop document IPC (not wired) |
| `CandidateService` | Candidate summary retrieval | `CandidateProfileStore`, `CandidateContextBuilder` | `InterviewIntelligence` (not wired in appLifecycle) |
| `ModelSystem` | Model lifecycle composition | `ModelRegistry`, `ModelStorage`, `ModelDownloadQueue`, `ModelInstallationManager`, `RuntimeRegistry`, `ModelRuntimeManager`, `ModelManager` | `appLifecycle` |
| `HardwareService` | Hardware profile + model plan | `HardwareProfiler`, `ModelManager` | `appLifecycle`, hardware IPC |
| `AnalyticsManager` | Event recording | none | `appLifecycle` |

### Canonical implementations
- AI execution: `AIManager` → `AIProvider.generate()`/`stream()` (wrapped by `ReliabilityManager`).
- Local AI: `LocalModelProvider` → `ModelManager` → `ModelRuntimeManager` → runtime (Kokoro/LlamaCpp/etc.).
- Cloud AI: `CloudAIProvider` → `CloudGateway` → `CloudProviderRegistry` → provider adapter.
- Interview prep: `InterviewIntelligence.analyzeForAI()` → `InterviewEngine` → `CandidateService` → `ContextManager` → `PromptService` → `AIRequest`.
- Model lifecycle: `ModelSystem` → `ModelManager` → install/download/runtime/integrity.
- Hardware: `HardwareService` → `HardwareProfiler` + `ModelManager` → renderer-safe DTOs.

---

## 3. FEATURE STATUS MATRIX

| Feature | Existing implementation | Main files | Connections | Status | Evidence | Missing work |
|---|---|---|---|---|---|---|
| AI provider abstraction | `AIProvider`, `AIManager`, `LocalModelProvider`, `CloudAIProvider` | `core/ai/AIProvider.ts`, `AIManager.ts`, `LocalModelProvider.ts`, `CloudAIProvider.ts` | AIManager → providers → ModelManager/CloudGateway | IMPLEMENTED_NOT_VERIFIED | Code reviewed; tests exist in `tests/unit/ai` | No desktop IPC consumer; no typecheck run (timeout) |
| Cloud providers | Gemini, Groq, Mistral, HuggingFace, Cerebras, OpenRouter adapters | `core/cloud/providers/*` | CloudGateway → registry → providers | IMPLEMENTED_NOT_VERIFIED | Code reviewed; credentials not tested | API keys not configured; no paid API calls |
| Local model runtime | Kokoro, LlamaCpp, WhisperCpp, Onnx runtimes | `core/models/runtime/*` | ModelManager → ModelRuntimeManager → runtime | IMPLEMENTED_NOT_VERIFIED | Code reviewed; no model download/test | No model downloaded; runtime health not tested |
| Model lifecycle | Install, integrity, restore, runtime, disposal | `core/models/ModelManager.ts`, `ModelSystem.ts`, installation/, runtime/, storage/ | ModelSystem composes all | IMPLEMENTED_NOT_VERIFIED | Code reviewed | No end-to-end install/validate test |
| Hardware assessment | Profiler, tier selector, load monitor | `core/hardware/HardwareProfiler.ts`, `HardwareTierSelector.ts`, `SystemLoadMonitor.ts` | HardwareService → profiler → DTO | VERIFIED | `tests/unit/hardware` passed (13 tests) | None |
| Interview classification | 10 engines, validator, classifier | `core/interview/engines/*`, `InterviewEngine.ts`, `InterviewClassifier.ts` | InterviewEngine standalone | IMPLEMENTED_NOT_VERIFIED | Code reviewed; `tests/unit/conversation` exists | No interview IPC consumer |
| Interview orchestration | `InterviewIntelligence` prepares AIRequest (no execution) | `core/interview/services/InterviewIntelligence.ts` | Returns AIRequest; caller must execute via core/ai | PARTIALLY_IMPLEMENTED | Code reviewed | Wire AIManager.execute; wire candidate/context |
| Prompt construction | `PromptService`, builders, registry, `toAIRequest()` | `core/prompts/services/PromptService.ts`, builders/, registry/ | PromptService → AIRequest (not executed) | IMPLEMENTED_NOT_VERIFIED | Code reviewed | None for prompt layer itself |
| Context retrieval | `ContextManager`, `createContextEngine` (mock embeddings, in-memory store) | `core/context/ContextManager.ts`, `createContextEngine.ts` | ContextManager injected into InterviewIntelligence (unused in appLifecycle) | PARTIALLY_IMPLEMENTED | Code reviewed | Production embedding/vector store; wire into appLifecycle |
| Candidate profiles | `CandidateService`, stores, context builder, evidence adapter | `core/candidate/services/CandidateService.ts`, stores/, contracts/ | CandidateService → CandidateProfileStore | IMPLEMENTED_NOT_VERIFIED | Code reviewed | Wire into InterviewIntelligence in appLifecycle |
| Document pipeline | `DocumentService`, `DocumentPipeline`, parsers, chunker, indexer | `core/documents/DocumentService.ts`, `DocumentPipeline.ts`, parsers/, indexing/ | DocumentAIAnalyzer abstraction (not wired) | PARTIALLY_IMPLEMENTED | Code reviewed | Default DocumentAIAnalyzer; desktop document IPC |
| Audio capture | `AudioCapture` (abstract, no mediaDevices), VAD, WhisperEngine | `core/audio/AudioCapture.ts`, `VoiceActivityDetector.ts`, `WhisperEngine.ts` | Abstract base; desktop adapter not found | PARTIALLY_IMPLEMENTED | Code reviewed | Desktop audio capture adapter; audio IPC not registered |
| Transcription pipeline | `AudioTranscriptionPipeline`, `TranscriptionEngine`, `TranscriptAssembler`, publisher | `core/audio/AudioTranscriptionPipeline.ts`, `TranscriptionEngine.ts`, `TranscriptAssembler.ts` | Pipeline → publisher → shared audio contract | IMPLEMENTED_NOT_VERIFIED | Code reviewed | Audio IPC not registered; conversation bridge wiring |
| Vision pipeline | `VisionPipeline`, `VisionAnalyzer`, `CaptureEngine`, OCR, classifier | `core/vision/pipeline/VisionPipeline.ts`, `VisionAnalyzer.ts`, `CaptureEngine.ts` | Vision IPC partially registered (vision.ipc.ts exists) | PARTIALLY_IMPLEMENTED | Code reviewed | Vision IPC consumer wiring; no desktop capture adapter found |
| Database | better-sqlite3 + drizzle, schemas, repositories, migrations | `database/client.ts`, `database/schema/*.ts`, `database/repositories/*.ts` | appLifecycle creates DB; repositories exist | IMPLEMENTED_NOT_VERIFIED | `tests/integration/database/database.test.ts` exists | Repositories not connected to desktop/server services |
| Server API | Routes/controllers/services for AI, analytics, docs, profiles, projects, sessions, stories | `server/src/routes/*.ts`, `controllers/*.ts`, `services/*.ts` | Standalone HTTP server; no desktop bridge | IMPLEMENTED_NOT_VERIFIED | Code reviewed | No integration with desktop IPC/core services |
| Desktop IPC (hardware) | `registerHardwareIpc`, preload `hardware` API | `desktop/ipc/hardware.ipc.ts`, `desktop/preload/api.ts` | HardwareService → IPC → preload → renderer | VERIFIED | Code reviewed; hardware unit tests passed | None |
| Desktop IPC (AI/interview/doc/context) | Channels defined in `shared/constants/events.ts`; NO handlers; NO preload exposure | `desktop/ipc/ai.ipc.ts` (empty), no `interview.ipc.ts`, `desktop/preload/api.ts` (no AI/interview/doc/context) | Disconnected | DISCONNECTED / MISSING | IPC channels defined but no handlers/preload | Implement handlers + preload exposure |
| Desktop app lifecycle | Service composition in `appLifecycle.ts` | `desktop/main/appLifecycle.ts` | DB, ModelSystem, AIManager, InterviewIntelligence, HardwareService, Analytics | PARTIALLY_IMPLEMENTED | Code reviewed | InterviewIntelligence lacks CandidateService+ContextManager; no interview/document/context/vision IPC registration |
| Reliability | Full ReliabilityManager | `core/reliability/ReliabilityManager.ts` + submodules | AIManager, ModelManager, InterviewIntelligence use it | IMPLEMENTED_NOT_VERIFIed | Code reviewed; ReliabilityContract union diff in working tree | Integration tests for timeout/retry/cancellation |
| Security | Secrets, encryption, privacy, sanitization, secure-delete, authorization | `core/security/*.ts` | Security contracts defined; limited IPC usage | PARTIALLY_IMPLEMENTED | Code reviewed | IPC sender validation on AI/interview doc channels; secrets not connected to providers |
| Analytics | AnalyticsManager, events, metrics, tracing | `core/analytics/AnalyticsManager.ts` + submodules | appLifecycle records app_start/app_shutdown | IMPLEMENTED_NOT_VERIFIED | `tests/unit/analytics` passed (7 tests) | Connect to AI/interview/document operations |

---

## 4. COMPLETE INTERVIEW PIPELINE

### Intended pipeline (per task description)

Authorized interview input → Question interpretation → Interview context → Candidate evidence retrieval → Relevant prompt construction → AI model execution → Response validation → Structured interview response → Desktop consumer.

### Actual verified data flow

1. **Audio input** → `AudioCapture` (abstract base; no desktop mediaDevices adapter found) → chunks.
2. **Transcription** → `TranscriptionEngine` → `TranscriptAssembler` → `AudioTranscriptionPipeline` → `AudioTranscriptPublisher` (publishes `PublishedAudioTranscript` to shared audio contract) + optional `AudioContextPublisher` (indexes into ContextManager).
3. **Conversation** → `ConversationManager.process(segment)` → `ConversationAnalyzer` → `ConversationAnalysis` (question detection, follow-up, topic tracking) stored in `ConversationMemory` per sessionId.
4. **Interview analysis** → `InterviewIntelligence.analyze()` → `InterviewEngine.execute()` (validate → classify → task engine → answer builder) → `InterviewAnalysis`.
5. **Candidate retrieval** → `InterviewIntelligence.retrieveCandidate()` → `CandidateService.getSummary()` → `CandidateSummary` (only if `candidateService` injected; NOT injected in `appLifecycle`).
6. **Context retrieval** → `InterviewIntelligence.retrieveInterviewContext()` → `ContextManager.query()` → compressed context (only if `contextManager` injected; NOT injected in `appLifecycle`).
7. **Prompt construction** → `PromptService.buildInterview()` → `PromptInstructionSet` → `PromptService.toAIRequest()` → canonical `AIRequest`.
8. **AI execution** → **MISSING**: `InterviewIntelligence` does NOT call `AIManager.generate()`. The `AIRequest` is returned to the caller. No desktop IPC or server endpoint currently consumes `analyzeForAI()` output and executes it via `AIManager`.
9. **Response** → Would be `AIResponse` (text or embedding) → validation → desktop consumer. **No consumer exists.**

### Broken / missing connections

| Connection | File | What is wrong | Why it matters |
|---|---|---|---|
| Interview prep → AI execution | `core/interview/services/InterviewIntelligence.ts:analyzeForAI()` | Returns `AIRequest`; does not invoke `AIManager.generate()` | Central feature cannot produce an AI response |
| InterviewIntelligence → CandidateService | `desktop/main/appLifecycle.ts` | `InterviewIntelligence` constructed without `candidateService` | Candidate-specific responses impossible at runtime |
| InterviewIntelligence → ContextManager | `desktop/main/appLifecycle.ts` | `InterviewIntelligence` constructed without `contextManager` | Context-grounded responses impossible at runtime |
| Desktop IPC → AI generation | `desktop/ipc/ai.ipc.ts` (empty); `desktop/main/index.ts` (no AI handlers) | No `ai:generate`/`ai:stream:*` handlers | Renderer cannot request AI generation |
| Desktop IPC → Interview | No `interview.ipc.ts`; no `interview:analyze`/`interview:task` handlers in `index.ts` | Renderer cannot request interview analysis | Interview UI cannot trigger analysis |
| Desktop IPC → Document | `desktop/ipc/document.ipc.ts` exists but unverified; no handlers in `index.ts` | Document upload/read not exposed | CV ingestion cannot be triggered from UI |
| Desktop IPC → Context | `desktop/ipc/context.ipc.ts` exists; no handlers in `index.ts` | Context query not exposed | Context retrieval cannot be triggered from UI |
| Preload API → AI/interview/doc/context | `desktop/preload/api.ts` exposes only app/window/hardware | Renderer has no `veyra.ai`, `veyra.interview`, `veyra.document`, `veyra.context` | Frontend cannot call backend intelligence |
| Document → AI analysis | `core/documents/DocumentService.ts` accepts injected `DocumentAIAnalyzer` | No default implementation connects to `AIManager` | Document semantic analysis not operational |
| Context → production store | `core/context/createContextEngine.ts` uses `MockEmbeddingService` + `InMemoryVectorStore` | Dev-only infrastructure | Context not persisted; embeddings not real |
| Audio capture → desktop | `core/audio/AudioCapture.ts` is abstract; `navigator.mediaDevices` access not implemented in desktop layer | No concrete desktop audio capture | Microphone input cannot be captured in production |

---

## 5. CANDIDATE INTELLIGENCE AND CV PIPELINE

### Ingestion → storage flow

1. **File pick/read** → Desktop `DOCUMENT_PICK`/`DOCUMENT_READ` IPC channels defined but **no handlers**.
2. **DocumentService.process()** → `DocumentPipeline` stages: validate → classify → parse (PDF/DOCX/HTML/MD/Text) → normalize → chunk → index preparation → storage.
3. **ParsedDocument** → `DocumentNormalizer` → `DocumentChunker` → `DocumentIndexer` produces `IndexBatch`.
4. **Document AI analysis** (optional) → `DocumentAIAnalyzer` abstraction → `AIManagerDocumentAnalyzer` → `AIManager` → provider → `DocumentAnalysis` (facts with `sourceChunkIds` provenance).
5. **Candidate evidence** → `CandidateDocumentEvidenceAdapter.ingest()` → `CandidateEvidenceStore.saveMany()` → `CandidateEvidence` records linked to `candidateId`.
6. **Candidate context** → `CandidateContextBuilder.build()` → aggregates profile + experiences + projects + skills + stories + external evidence → `CandidateContext`.
7. **Context publishing** → `CandidateContextPublisher` publishes to generic `ContextManager` (injection point; not wired in appLifecycle).
8. **Interview consumption** → `InterviewIntelligence.retrieveCandidate()` → `CandidateService.getSummary()` → `CandidateSummary` (not wired in appLifecycle).
9. **Prompt grounding** → `InterviewIntelligence.toPromptCandidateEvidence()` → `PromptCandidateEvidence` → `PromptService.buildInterview()` → `AIRequest`.

### What the AI can answer from

- Work experience: via `ExperienceStore` → `CandidateContextBuilder` → `relevantEvidence`.
- Educational background: not explicitly modeled as a separate store (may be in profile or stories).
- Skills: via `SkillStore`.
- Certifications: not a dedicated store; may be in profile/stories.
- Previous projects: via `ProjectStore`.
- Achievements: via `StoryStore`.
- Portfolio information: via document upload → evidence adapter.
- Uploaded supporting documents: via `DocumentService` → `CandidateDocumentEvidenceAdapter`.

### Source provenance

- `DocumentAnalysisFact.sourceChunkIds` — traces facts back to document chunks. **Good.**
- `CandidateDocumentEvidenceAdapter` preserves `analysisId`, `documentId` in result. **Good.**
- No evidence that AI-generated claims are flagged as unverified when retrieval returns nothing. `InterviewIntelligence` proceeds with `candidate: undefined` and `context: undefined` when services are absent — the prompt is still built, potentially grounding the model in nothing.

### Missing information handling

- `InterviewIntelligence.retrieveCandidate()` returns `undefined` when no `candidateService` or no `candidateId` — no error, silent degradation.
- `retrieveInterviewContext()` returns `undefined` when no `contextManager` — silent degradation.
- Prompt builder handles missing candidate/context gracefully (builds prompt without grounding).

---

## 6. LOCAL AND CLOUD MODEL ARCHITECTURE

### Provider registration and routing

- `AIManager.register()` / `registerLocalModelProvider()` / `registerCloudAIProvider()` / `registerCloudAIProviderFromRegistry()`.
- `appLifecycle.ts` registers local provider from `ModelSystem.getModelManager()` and all cloud providers from `createDefaultCloudProviderRegistry({ allowUnconfigured: false })`.
- `AIRouter` evaluates providers against `AIRoutingPolicy` (requirements: streaming, vision, structuredOutput, runtime, allowedProviders; execution: allowFallback, maxAttemptsPerCandidate).
- `AIExecutionStrategy` executes plan with retry/fallback; disables fallback after output emitted.

### Cloud providers

| Provider | Capabilities | Status |
|---|---|---|
| Gemini | text, streaming, vision, document analysis, structured output, tool calling | Adapter implemented; credentials not configured |
| Groq | text, streaming | Adapter implemented; credentials not configured |
| Mistral | text, streaming | Adapter implemented; credentials not configured |
| HuggingFace | text | Adapter implemented; credentials not configured |
| Cerebras | text | Adapter implemented; credentials not configured |
| OpenRouter | text | Adapter implemented; credentials not configured |

### Local model lifecycle statuses

Existing statuses in code (from `ModelManager`, `ModelInstallationManager`, `ModelDownloadQueue`, `ModelRuntimeManager`):

- `NOT_INSTALLED` — implied by absence from `installedModels` map / registry `listAvailable()`.
- `DOWNLOADING` — `ModelDownloadQueue` tracks in-flight downloads.
- `INSTALLED` — `ModelManager.listInstalled()`.
- `INTEGRITY_FAILED` — `ModelIntegrityService` validates sha256.
- `RUNTIME_STARTING` / `RUNTIME_FAILED` — `ModelRuntimeManager` load results (`RuntimeLoadResult`).
- `VALIDATING` — `ModelBenchmark` runs after install optionally.
- `READY` — model installed + runtime loaded + health check passes.
- `DEGRADED` / `UNAVAILABLE` — implied by health/recovery paths.

These statuses **mostly exist** but are not exposed through a single canonical model-status API. `ModelSystem.getStatus()` returns initialized/registered/available/installed counts but not per-model lifecycle status.

### Hardware assessment

- `HardwareProfiler` collects: OS, architecture, CPU, total/available RAM, GPU, VRAM, storage, acceleration backends, runtime load (via `systeminformation` + `node:os`).
- `HardwareTierSelector` computes hardware tier and model selection plan.
- `SystemLoadMonitor` monitors current consumption.
- `HardwareService` converts to renderer-safe DTOs (`HardwareSnapshotResponse`, `HardwareModelPlan`).
- **Available vs installed memory**: `HardwareProfiler` distinguishes total and available RAM via `createMemoryProfile`. **Good.**
- Model memory requirements: `ModelCompatibility` evaluates model vs hardware; `ModelBenchmark` measures actual performance.

### Model recommendation

- `ModelSelector` produces `ModelSelectionPlan` with primary/fallbacks per modality (llm, stt, vision, tts).
- `HardwareService.getSafeModelPlan()` returns renderer-safe plan.
- No explicit "ask user approval before download" flow found in desktop IPC/preload (hardware IPC only exposes getProfile/refresh/getModelPlan; no install/approve channels).
- `ModelInstallationManager` + `ModelDownloadQueue` handle download/install; `ModelInstallationPolicy` guards.

### Remaining gaps

- No desktop IPC for model install/approve/start/validate/ready status.
- No production embedding service (MockEmbeddingService only).
- Model READY status requires successful inference test — not implemented as a gate.
- No resource monitoring during inference (memory pressure, GPU pressure, CPU saturation) beyond `SystemLoadMonitor`.

---

## 7. DATABASE ARCHITECTURE

### Engine and connection
- `better-sqlite3` (synchronous SQLite) + `drizzle-orm`.
- `createDatabase(options)` creates file, runs WAL pragma, foreign keys, busy timeout, runs migrations, returns `{ db, sqlite, close, healthCheck }`.
- `getDatabase()` singleton; `closeDatabase()` closes.
- `withTransaction<T>(callback)` wraps drizzle transaction.

### Schemas (`database/schema/`)
`answers`, `captures`, `companies`, `documents`, `experiences`, `index.ts`, `metrics`, `profiles`, `projects`, `questions`, `sessions`, `skills`, `stories`, `transcripts`, `_shared`.

### Migrations
- `database/migrations/0000_initial.sql` present (untracked/new).
- `runMigrations()` executes all `.sql` files in folder sorted alphabetically.

### Repositories (`database/repositories/`)
`documentRepository.ts`, `profileRepository.ts`, `projectRepository.ts`, `sessionRepository.ts`, `storyRepository.ts` — implementations not fully inspected (connection to desktop/server services not verified).

### Data models vs shared types
- `shared/types/` defines `Document`, `CandidateSummary`, `Profile`, `Session`, etc.
- `database/schema/` defines SQL tables.
- **Unverified**: whether shared types match DB schema columns and repository return types. No repository-to-service wiring confirmed.

### Persistence boundaries
- `appLifecycle.ts` creates database at `app.getPath("userData")/veyra.db` and closes on shutdown.
- Context layer uses `InMemoryVectorStore` (not persisted to DB).
- Candidate stores (`CandidateProfileStore`, etc.) are interfaces; implementation/persistence layer not confirmed as DB-backed.

### Missing integrations
- Repositories not imported/wired in `appLifecycle.ts` or desktop IPC.
- No server↔database desktop bridge.
- No encryption-at-rest for DB (SQLite file plaintext).
- No secure deletion of interview audio/transcripts beyond `SecureDelete` utility (unused).

---

## 8. SERVER AND DESKTOP INTEGRATION

### Desktop
- `index.ts` bootstrap: `initializeApplication()` → `registerIPC()` (window/app only) → `createMainWindow()`.
- `appLifecycle.ts`: DB, `ModelSystem`, `ReliabilityManager`, `AIManager` (local + cloud), `PromptService`, `InterviewIntelligence` (no candidate/context), `HardwareService`, hardware IPC.
- IPC handlers registered: app, window, hardware, session, settings, capture, overlay, vision.
- **Missing IPC handlers**: AI (`ai:generate`, `ai:stream:*`, `ai:provider-status`), interview (`interview:analyze`, `interview:task`, `interview:guidance`), document (`document:pick/read/delete/list`), context.
- Preload `api.ts` exposes: `app`, `window`, `hardware`. **Missing**: `ai`, `interview`, `document`, `context`, `vision`, `capture`, `session`, `settings`.

### Server
- `server/src/app.ts` + `server.ts`: HTTP server.
- Routes: `ai.routes.ts`, `analytics.routes.ts`, `documents.routes.ts`, `health.routes.ts`, `profiles.routes.ts`, `projects.routes.ts`, `sessions.routes.ts`, `stories.routes.ts`.
- Controllers: `ai.controller.ts`, `analytics.controller.ts`, `document.controller.ts`, `profile.controller.ts`, `project.controller.ts`, `session.controller.ts`, `story.controller.ts`.
- Services: `ai.service.ts`, `analytics.service.ts`, `document.service.ts`, `profile.service.ts`, `project.service.ts`, `session.service.ts`, `story.service.ts`.
- Middleware: `error.middleware.ts`, `rateLimit.middleware.ts`, `security.middleware.ts`, `validation.middleware.ts`.
- Config: `ai.ts`, `database.ts`, `env.ts`.

### Integration gaps
- No evidence server routes call core services (`AIManager`, `InterviewIntelligence`, `DocumentService`).
- No evidence desktop IPC calls server HTTP endpoints.
- Server and desktop are parallel, unconnected stacks sharing `shared/` and `core/` via tsconfig project references.
- `tsconfig.server.json` includes `server/src`, `shared`, `core`, `database` — server can import core, but no import evidence reviewed.

---

## 9. SECURITY AND RELIABILITY

### Security controls present
- `core/security/`: `SecretsManager`, `Encryption`, `PrivacyManager`, `SecureDelete`, `DataSanitizer`, `InputSanitizer`, `AuthorizationManager`, `Policy`, `Permission`, `Identity`, `IdentityManager`, audit contracts.
- Desktop preload: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, no `ipcRenderer` exposure, `window.veyra` allow-list only.
- `windowManager.ts`: `will-navigate` restriction, `setWindowOpenHandler` https-only in dev.
- `hardware.ipc.ts`: sender validation (`event.sender.isDestroyed()`), request object sanitization (`assertRequestObject`), boolean-only `forceRefresh`.

### Security controls missing
- IPC sender/operation authorization for AI/interview/document channels (not implemented because channels don't exist).
- API key protection: cloud provider configs accept credentials but no evidence of secure storage (SecretsManager exists but not wired to providers).
- No secrets in logs: `AIManager.toAIError()` includes `operationId`, `componentId`, `requestId` in details — no API keys observed, but audit needed.
- Input validation at IPC boundaries: hardware IPC validates; AI/interview/doc channels don't exist.
- File upload restrictions: `document:pick` channel defined but no handler/size/type limits.
- Encryption at rest: SQLite DB plaintext.
- Secure deletion: `SecureDelete` utility exists but not connected to audio/transcript/document cleanup.

### Reliability controls present
- `ReliabilityManager`: timeout, retry (exponential backoff), recovery, failure classification, operation lifecycle, health checks.
- `AIManager.generate()`: reliability-wrapped; `stream()` deliberately not retried (post-output fallback disabled).
- `CloudGateway`: default `maxAttempts: 1` to avoid double retry with `AIExecutionStrategy`.
- `ModelManager`: reliability boundary for model operations; delegates to `ReliabilityManager`.
- `DocumentPipeline`: `throwIfAborted` at each stage; `continueOnStageError` option.
- `ContextManager`: `throwIfAborted` at index/query steps.

### Reliability controls missing
- No circuit breaker observed in `ReliabilityManager` (contracts/errors/circuit exist but usage not confirmed).
- No resource cleanup supervision for long-running transcription/inference.
- No health-check scheduling for providers/runtimes (on-demand only).
- Streaming cancellation: `AIRequest.signal` supported but no desktop stream-cancel IPC consumer.

### Duplicate responsibility risk
- `AIManager` has its own `ReliabilityManager`; `ModelManager` has its own; `InterviewIntelligence` has its own. `appLifecycle` creates one shared `ReliabilityManager` and passes to `AIManager` and `InterviewIntelligence`, but `ModelManager` (inside `ModelSystem`) may create its own. Potential for nested retry/timeout if not all share the same instance.

---

## 10. BROKEN CONNECTIONS AND CRITICAL ISSUES

### Issue 1 — Interview pipeline does not execute AI
- **File:** `core/interview/services/InterviewIntelligence.ts` (`analyzeForAI`)
- **What is wrong:** Builds `AIRequest` and returns it; does not call `AIManager.generate()`.
- **Why it matters:** Core feature cannot produce an AI-generated interview response.
- **Depends on:** `core/ai/AIManager.generate()`.
- **Correction:** Add `InterviewIntelligence.executeAI()` or have desktop IPC caller invoke `AIManager.generate(provider, aiRequest)` after `analyzeForAI()`.

### Issue 2 — InterviewIntelligence not wired with CandidateService/ContextManager
- **File:** `desktop/main/appLifecycle.ts` (`initializeApplicationServices`)
- **What is wrong:** `new InterviewIntelligence({ promptService, reliabilityManager })` — no `candidateService`, no `contextManager`.
- **Why it matters:** Candidate grounding and context retrieval are silent no-ops at runtime.
- **Depends on:** `core/candidate/services/CandidateService`, `core/context/ContextManager`, `core/context/createContextEngine`.
- **Correction:** Construct `CandidateService` + stores + `ContextManager` via `createContextEngine()`; inject into `InterviewIntelligence`.

### Issue 3 — Missing desktop IPC handlers for AI/interview/document/context
- **File:** `desktop/main/index.ts` (`registerIPC`); `desktop/ipc/ai.ipc.ts` (empty); no `interview.ipc.ts`.
- **What is wrong:** Channels defined in `shared/constants/events.ts` have no main-process handlers.
- **Why it matters:** Renderer cannot trigger AI generation, interview analysis, document read, or context query.
- **Depends on:** `AIManager`, `InterviewIntelligence`, `DocumentService`, `ContextManager`, `shared/contracts/ai.contract.ts`, `interview.contract.ts`, `context.contract.ts`.
- **Correction:** Implement handlers; validate input; return `Result<...>` shapes; expose via preload.

### Issue 4 — Preload API incomplete
- **File:** `desktop/preload/api.ts`, `desktop/preload/types.ts`
- **What is wrong:** Exposes only `app`, `window`, `hardware`.
- **Why it matters:** Frontend cannot access backend intelligence features.
- **Correction:** Add `veyra.ai`, `veyra.interview`, `veyra.document`, `veyra.context`, `veyra.vision`, `veyra.session` APIs backed by `ipcRenderer.invoke`.

### Issue 5 — TS config deprecation (TS5101)
- **File:** `tsconfig.client.json`
- **What is wrong:** `baseUrl: "."` deprecated in TS 6.0.3; `ignoreDeprecations: "6.0"` masks it.
- **Why it matters:** Build may break in future TS versions; `paths` should use relative paths.
- **Correction:** Remove `baseUrl` and `ignoreDeprecations`; use `"./client/src/*"` etc. (already done in working tree, not committed).

### Issue 6 — Context layer uses dev-only infrastructure
- **File:** `core/context/createContextEngine.ts`
- **What is wrong:** `MockEmbeddingService` (deterministic hash) + `InMemoryVectorStore` (non-persistent).
- **Why it matters:** Context retrieval not production-ready; not persisted.
- **Correction:** Replace with real embedding service + persistent vector store (or SQLite-backed store).

### Issue 7 — Document AI analysis not wired
- **File:** `core/documents/DocumentService.ts`; `DocumentAIAnalyzer` abstraction.
- **What is wrong:** `DocumentService` accepts injected `DocumentAIAnalyzer`; no default connects to `AIManager`.
- **Why it matters:** CV/document semantic analysis not operational.
- **Correction:** Implement `DocumentAIAnalyzer` using `AIManager`; wire in composition root.

### Issue 8 — No desktop audio capture adapter
- **File:** `core/audio/AudioCapture.ts` (abstract); no desktop implementation found.
- **What is wrong:** `AudioCapture` is abstract and does not access `navigator.mediaDevices` or Electron APIs.
- **Why it matters:** Microphone input cannot be captured in production desktop app.
- **Correction:** Implement desktop `AudioCapture` using Electron `desktopCapturer`/`navigator.mediaDevices` (preload→main boundary).

---

## 11. DUPLICATE AND CONFLICTING IMPLEMENTATIONS

None deleted or consolidated (per audit rules). Observed duplication/tension:

| Area | Competing items | Canonical choice |
|---|---|---|
| AI request type | `shared/types/ai.ts::AIRequest` vs `core/ai/AIRequest.ts` (re-export) | `shared/types/ai.ts` is canonical; `core/ai/AIRequest.ts` re-exports + `createAIRequest()` helper |
| AI response type | `shared/types/ai.ts::AIResponse` vs `core/ai/AIResponse.ts` (re-export) | `shared/types/ai.ts` canonical |
| Reliability result | Old flat `ReliabilityExecutionResult` vs new discriminated union (`ReliabilityExecutionSuccess`/`ReliabilityExecutionFailure`) | New union (in working tree diff) |
| Interview orchestration | `InterviewEngine.analyze()` (returns analysis only) vs `InterviewIntelligence.analyzeForAI()` (returns AIRequest) | Both valid: Engine = domain analysis; Intelligence = application orchestration |
| Document analysis | `DocumentService` pipeline vs `DocumentAIAnalyzer` → `AIManager` | `DocumentService` owns pipeline; AI analysis is optional enrichment behind abstraction |
| Context store | `ContextManager.contexts` (in-memory Map) vs `ContextStore`/`VectorStore` interface | `ContextStore`/`VectorStore` is the contract; in-memory is dev impl |
| Model runtime | `ModelSystem.registerBuiltInRuntimes` vs user-supplied `runtimeFactories` | User factories win; built-ins are defaults |
| Cloud provider | `CloudGateway` (reliability-wrapped, maxAttempts=1) vs `AIExecutionStrategy` (retry/fallback) | Intentional layering: strategy owns retries; gateway owns single attempt |

No abandoned implementations identified. No conflicting contracts requiring immediate resolution beyond the `ReliabilityContract` union diff already in working tree.

---

## 12. TESTING EVIDENCE

### Tests executed
| Command | Result |
|---|---|
| `npx vitest run tests/unit/analytics tests/unit/security` | 2 files passed, 7 tests passed |
| `npx vitest run tests/unit/hardware` | 3 files passed, 13 tests passed |

### Tests inspected (not executed)
- `tests/unit/ai/` — AI unit tests
- `tests/unit/audio/` — audio tests
- `tests/unit/context/` — context tests
- `tests/unit/conversation/` — conversation tests
- `tests/unit/vision/` — vision tests
- `tests/integration/ai-pipeline/` — AI pipeline integration
- `tests/integration/audio-pipeline/` — audio pipeline integration
- `tests/integration/database/database.test.ts` — database integration
- `tests/integration/rag-pipeline/` — RAG pipeline integration
- `tests/integration/vision-pipeline/` — vision pipeline integration
- `tests/e2e/interview/`, `tests/e2e/preparation/`, `tests/e2e/settings/` — Playwright e2e
- `tests/mocks/ai/`, `tests/mocks/audio/`, `tests/mocks/vision/` — mocks

### Build/typecheck results
- `tsc -b` / per-project `tsc --noEmit` **timed out** (>120s) on this codebase (~3,500+ TS files). Not confirmed passing or failing.
- `tsconfig.client.json` TS5101 `baseUrl` deprecation identified; fixed in working tree (not committed).
- TS 6.0.3 installed (`node_modules/typescript/package.json`).

### Untested functionality
- Desktop IPC handlers (none exist for AI/interview/document/context — nothing to test).
- End-to-end interview execution (preparation → AIManager → response).
- Model download/install/integrity/READY gating.
- Cloud provider API calls (no credentials; must not call paid APIs).
- Local model inference (no model downloaded).
- Database repository→service wiring.
- Server route→controller→service→core wiring.

### Environmental blockers
- Typecheck timeout due to codebase size; no per-file scoped check completed.
- No API keys configured (`.env.example` restored; no secrets committed).
- No local models downloaded; no inference runtime binaries (llama.cpp/whisper.cpp) present.
- Cannot call paid cloud APIs per audit rules.

---

## 13. IMPLEMENTATION ROADMAP

### P0 — Critical architectural and integration blockers

**P0.1 Fix TS config and commit safe baseline**
- Objective: Resolve TS5101 `baseUrl` deprecation; ensure `tsconfig.client.json` is valid for TS 6.0.3.
- Existing implementation: `tsconfig.client.json` (working tree already fixed).
- Files: `tsconfig.client.json`.
- Dependencies: None.
- Required changes: Remove `baseUrl` and `ignoreDeprecations`; use relative `paths`.
- Acceptance: `tsc -p tsconfig.client.json --noEmit` completes without TS5101.
- Tests: Typecheck.
- Risks: Working-tree change not yet committed; must not include unrelated `.env.example` secret changes.

**P0.2 Implement desktop IPC for AI generation**
- Objective: Expose `ai:generate`, `ai:stream:start`, `ai:stream:cancel`, `ai:provider-status` via main-process handlers + preload.
- Existing: `shared/constants/events.ts` channels; `shared/contracts/ai.contract.ts`; `core/ai/AIManager`.
- Files: `desktop/ipc/ai.ipc.ts` (implement), `desktop/main/index.ts` (register), `desktop/preload/api.ts` + `types.ts` (expose).
- Dependencies: `AIManager`, `shared/contracts/ai.contract.ts`.
- Required changes: Create `ai.ipc.ts` with validated handlers returning `Result<AIGenerateResponse>`; register in `index.ts`; add `veyra.ai` to preload.
- Acceptance: Renderer can invoke `window.veyra.ai.generate(request)` and receive typed result; IPC sender validated; `AbortSignal` not serialized.
- Tests: Unit test IPC handler with mocked `AIManager`.
- Risks: Streaming cancellation lifecycle not fully defined; keep to non-streaming generate first.

**P0.3 Implement desktop IPC for interview analysis**
- Objective: Expose `interview:analyze`, `interview:task`, `interview:guidance`; return prepared `AIRequest` (execution separated).
- Existing: `shared/contracts/interview.contract.ts`; `core/interview/services/InterviewIntelligence`; `core/interview/services/InterviewEngine`.
- Files: `desktop/ipc/interview.ipc.ts` (new), `desktop/main/index.ts`, `desktop/preload/api.ts` + `types.ts`.
- Dependencies: `InterviewIntelligence`, `InterviewEngine`, `CandidateServiceContract`, `ContextManager`.
- Required changes: Create IPC handlers calling `InterviewIntelligence.analyze()`/`analyzeForAI()`; return `InterviewAnalysisResponse` / `InterviewPrepareAIResponse`.
- Acceptance: Renderer can request interview analysis and receive `InterviewAnalysis` + optional `AIRequest`.
- Tests: Unit test with mocked `InterviewEngine`/`CandidateService`/`ContextManager`.
- Risks: `AIRequest.signal` must not cross IPC; strip before serialization.

**P0.4 Wire InterviewIntelligence with CandidateService + ContextManager in appLifecycle**
- Objective: Enable candidate grounding and context retrieval at runtime.
- Existing: `desktop/main/appLifecycle.ts`; `core/candidate/services/CandidateService`; `core/context/createContextEngine`.
- Files: `desktop/main/appLifecycle.ts`.
- Dependencies: Candidate stores, `ContextManager`, `PromptService`, `ReliabilityManager`.
- Required changes: Construct `CandidateService` + stores; construct `ContextEngine` via `createContextEngine()`; inject into `InterviewIntelligence`.
- Acceptance: `InterviewIntelligence.analyzeForAI()` returns grounded prompt with candidate + context when available.
- Tests: Unit test `InterviewIntelligence` with real `CandidateService` stub + mock `ContextManager`.
- Risks: `createContextEngine` uses mock embeddings (see P2.2).

**P0.5 Implement desktop IPC for document read/list**
- Objective: Expose `document:pick`, `document:read`, `document:list`, `document:delete`.
- Existing: `shared/contracts/document.contract.ts`; `core/documents/DocumentService`; `database/repositories/documentRepository.ts`.
- Files: `desktop/ipc/document.ipc.ts`, `desktop/main/index.ts`, `desktop/preload/api.ts` + `types.ts`.
- Dependencies: `DocumentService`, database repositories.
- Required changes: Implement handlers; validate `DocumentReadRequest`/`DocumentListRequest`; return `Result<...>`.
- Acceptance: Renderer can list/read documents from DB.
- Tests: Unit test with mocked repository.
- Risks: File system access for `document:pick` requires Electron `openDialog`; scope to read/list from DB first.

### P1 — Complete the core interview-intelligence pipeline

**P1.1 Execute AIRequest from interview preparation**
- Objective: Connect `InterviewIntelligence.analyzeForAI()` output → `AIManager.generate()` → `AIResponse` returned to desktop consumer.
- Existing: `InterviewIntelligence.analyzeForAI()`; `AIManager.generate()`.
- Files: `desktop/ipc/interview.ipc.ts` (or new orchestration handler).
- Dependencies: `AIManager`, `InterviewIntelligence`.
- Required changes: After `analyzeForAI()`, call `AIManager.generate(provider, aiRequest)`; return `InterviewExecuteAIResponse` with `AIResponse`.
- Acceptance: End-to-end: interview input → analysis → candidate → context → prompt → AI response → desktop.
- Tests: Integration test with mocked `AIManager` returning fixed response.
- Risks: Streaming not supported yet; start with non-streaming `generate()`.

**P1.2 Question classification verification**
- Objective: Confirm `InterviewClassifier` + 10 engines correctly classify behavioral/technical/coding/system-design/product/case/communication/general/motivation/situational.
- Existing: `core/interview/classification/InterviewClassifier.ts`; `core/interview/engines/*.ts`.
- Files: `tests/unit/conversation/` (extend).
- Dependencies: `InterviewValidator`, `InterviewClassifier`.
- Required changes: Add unit tests covering each interview type.
- Acceptance: Each engine produces correct `InterviewTask` for representative input.
- Tests: Unit tests per engine.
- Risks: Classification is deterministic; no ML model needed.

### P2 — Complete candidate intelligence, document analysis, multimodal understanding

**P2.1 Production embedding + vector store for Context**
- Objective: Replace `MockEmbeddingService`/`InMemoryVectorStore` with persistent implementation.
- Existing: `core/context/EmbeddingService.ts` (interface + mock); `core/context/storage/VectorStore.ts`.
- Files: `core/context/embeddings/*`, `core/context/storage/*`, `core/context/createContextEngine.ts`.
- Dependencies: Embedding provider (local model via `ModelManager` or cloud).
- Required changes: Implement real `EmbeddingService` backed by local model runtime or cloud embeddings; persistent `ContextStore` (SQLite-backed or vector DB).
- Acceptance: Context query returns semantically relevant results; persists across restarts.
- Tests: Integration test with `createContextEngine`.
- Risks: Embedding model must be downloaded/validated first (depends on model lifecycle).

**P2.2 Default DocumentAIAnalyzer**
- Objective: Connect `DocumentService` → `AIManager` for semantic document analysis.
- Existing: `core/documents/analysis/DocumentAIAnalyzer.ts` (abstraction); `DocumentAIAnalysisDependencies`.
- Files: `core/documents/analysis/DocumentAIAnalyzer.ts`, `core/documents/analysis/AIManagerDocumentAnalyzer.ts`.
- Dependencies: `AIManager`, `DocumentService`.
- Required changes: Implement `DocumentAIAnalyzer` using `AIManager.generate()` with document-analysis prompt; return `DocumentAnalysis` with `sourceChunkIds`.
- Acceptance: Uploaded CV → pipeline → `DocumentAnalysis` facts with chunk provenance.
- Tests: Unit test with mocked `AIManager`.
- Risks: AI-generated facts must carry `sourceChunkIds`; never presented as verified without provenance.

**P2.3 Vision pipeline desktop integration**
- Objective: Connect `desktop/ipc/vision.ipc.ts` handler → `VisionPipeline` → `VisionResult` → preload.
- Existing: `core/vision/pipeline/VisionPipeline.ts`; `desktop/ipc/vision.ipc.ts` (exists, unverified); `VISION_ANALYZE` channel.
- Files: `desktop/ipc/vision.ipc.ts`, `desktop/main/index.ts`, `desktop/preload/api.ts`.
- Dependencies: `VisionPipeline`, `VisionAnalyzer`, image capture.
- Required changes: Register vision IPC; validate `VisionRequest`; return `VisionResult`; no `AbortSignal` serialization.
- Acceptance: Renderer can send image data URL/path; receives `VisionResult`.
- Tests: Unit test with mocked `VisionAnalyzer`.
- Risks: Image binary must not cross IPC as raw bytes; use `imageDataUrl` or `imagePath`.

### P3 — Complete local/cloud model management and hardware-aware runtime validation

**P3.1 Model install/approve/validate IPC**
- Objective: Expose model lifecycle: download with user approval, integrity check, runtime start, READY gating.
- Existing: `core/models/ModelInstallationManager`, `ModelDownloadQueue`, `ModelIntegrityService`, `ModelRuntimeManager`, `ModelBenchmark`.
- Files: `desktop/ipc/models.ipc.ts` (new), `desktop/main/index.ts`, `desktop/preload/api.ts`.
- Dependencies: `ModelSystem`, `HardwareService`.
- Required changes: Handlers for `model:install`, `model:validate`, `model:load`, `model:status`; gate `READY` on successful inference test.
- Acceptance: Model transitions NOT_INSTALLED → DOWNLOADING → INSTALLED → VALIDATING → READY only after inference test.
- Tests: Unit test with mocked downloader/runtime.
- Risks: No model binaries present; cannot test actual download/inference.

**P3.2 Resource monitoring during inference**
- Objective: Monitor memory/GPU/CPU during model execution; degrade/unload on pressure.
- Existing: `core/hardware/SystemLoadMonitor.ts`; `core/models/installation/MemoryPressureGuard.ts`, `DiskSpaceGuard.ts`.
- Files: `core/models/runtime/ModelRuntimeManager.ts` (extend).
- Dependencies: `SystemLoadMonitor`, `ModelRuntimeManager`.
- Required changes: Wrap inference with resource checks; unload on pressure; recovery after failure.
- Acceptance: Inference aborts/degrades under memory pressure; recovers after failure.
- Tests: Unit test with simulated pressure.
- Risks: Cannot simulate real GPU pressure without hardware.

### P4 — Complete persistence, reliability, security, backend production readiness

**P4.1 Repository → service wiring**
- Objective: Connect `database/repositories/*` to desktop services and/or server services.
- Existing: `database/client.ts`, `repositories/*`, `server/src/repositories/*`, `server/src/services/*`.
- Files: `desktop/main/appLifecycle.ts`, `server/src/services/*`.
- Dependencies: Database singleton.
- Required changes: Inject repositories into services; persist candidate profiles, documents, sessions, transcripts.
- Acceptance: Candidate profile saved to DB survives restart.
- Tests: Integration test `tests/integration/database`.
- Risks: Schema/type drift between `shared/types` and `database/schema`.

**P4.2 Security at IPC trust boundaries**
- Objective: Authorization + input validation on AI/interview/document/context channels.
- Existing: `core/security/AuthorizationManager`, `InputSanitizer`; `hardware.ipc.ts` pattern.
- Files: `desktop/ipc/*.ts` (new handlers).
- Dependencies: `AuthorizationManager`, `InputSanitizer`.
- Required changes: Sender validation, request sanitization, operation allow-list per handler.
- Acceptance: Invalid/unauthorized IPC requests rejected with typed error.
- Tests: Unit test IPC rejection.
- Risks: Overly restrictive authorization blocks legitimate renderer calls.

**P4.3 Secrets management for cloud providers**
- Objective: Store provider API keys via `SecretsManager`; never log/expose.
- Existing: `core/security/SecretsManager.ts`; cloud provider configs.
- Files: `core/cloud/CloudProviderConfig.ts`, `core/security/SecretsManager.ts`, `desktop/main/appLifecycle.ts`.
- Dependencies: `SecretsManager`, `Electron.store` (`electron-store` dependency).
- Required changes: Wire `SecretsManager` into cloud provider config resolution; mask keys in logs/errors.
- Acceptance: API keys not in logs, not serialized across IPC, not in frontend responses.
- Tests: Security unit test.
- Risks: `.env.example` must never contain real keys (already restored).

### P5 — Final integration and end-to-end verification

**P5.1 End-to-end interview test**
- Objective: Simulated full flow: audio transcript → conversation → interview analysis → candidate → context → prompt → AI response → desktop.
- Existing: `tests/e2e/interview/`, `tests/fixtures/transcripts/`, `tests/fixtures/questions/`, `tests/mocks/ai/`.
- Files: `tests/integration/interview-pipeline.test.ts` (new).
- Dependencies: All core services + mocked AI provider.
- Required changes: Integration test using mocks for AI/audio; assert `AIResponse` produced.
- Acceptance: Deterministic end-to-end flow passes with mocked AI.
- Tests: New integration test.
- Risks: Requires assembling many mocks; keep focused.

**P5.2 Typecheck and lint**
- Objective: `npm run typecheck` and `npm run lint` pass.
- Files: All `tsconfig.*`, source.
- Dependencies: None.
- Required changes: Resolve residual TS errors; fix lint violations.
- Acceptance: Zero TS errors; zero lint errors.
- Tests: `npm run typecheck`, `npm run lint`.
- Risks: Codebase size caused earlier timeout; run per-project with longer timeout.

---

## 14. AGENT HANDOFF INSTRUCTIONS

### What has already been investigated
All five approved directories (`core/`, `shared/`, `desktop/`, `database/`, `server/`) recursively mapped. Key services read: `AIManager`, `ReliabilityManager`, `InterviewIntelligence`, `InterviewEngine`, `PromptService`, `ContextManager`, `DocumentService`, `CandidateService`, `ModelManager`, `ModelSystem`, `HardwareService`, `HardwareProfiler`, `TranscriptionEngine`, `AudioTranscriptionPipeline`, `VisionPipeline`, `ConversationManager`, database client + schemas + repositories, server routes/controllers/services, desktop IPC + preload + appLifecycle + index + windowManager.

### Important files and their responsibilities
- `desktop/main/appLifecycle.ts` — service composition root (must wire candidate/context/interview IPC).
- `desktop/main/index.ts` — Electron bootstrap + IPC registration (missing AI/interview/doc/context handlers).
- `desktop/preload/api.ts` + `types.ts` — renderer API surface (missing AI/interview/doc/context/vision).
- `core/interview/services/InterviewIntelligence.ts` — prepares `AIRequest`; does not execute (P0/P1).
- `core/ai/AIManager.ts` — provider registration + generate/stream (execution target).
- `shared/contracts/ai.contract.ts` — IPC-safe AI contracts.
- `shared/contracts/interview.contract.ts` — IPC-safe interview contracts.
- `shared/constants/events.ts` — `IPC_CHANNELS` / `IPC_EVENTS` canonical strings.
- `database/client.ts` — SQLite/drizzle singleton.
- `core/context/createContextEngine.ts` — context composition (mock embeddings; replace in P2).

### Existing canonical services
- `AIManager` (AI execution), `ReliabilityManager` (reliability), `InterviewEngine` (interview domain), `InterviewIntelligence` (interview orchestration), `PromptService` (prompt construction), `ContextManager` (context), `DocumentService` (documents), `CandidateService` (candidates), `ModelSystem`/`ModelManager` (models), `HardwareService` (hardware), `AnalyticsManager` (analytics).

### Existing interfaces and contracts
- `shared/types/ai.ts` — `AIRequest`, `AIResponse`, `AIMessage`, `AIVisionInput`.
- `shared/contracts/ai.contract.ts` — `AIGenerateRequest/Response`, `AIStreamStart*`, `AIProviderStatus*`.
- `shared/contracts/interview.contract.ts` — `InterviewServiceContract`, `InterviewAnalysisResponse`, `InterviewTaskResponse`.
- `shared/contracts/candidate.contract.ts` — `CandidateServiceContract`.
- `shared/constants/events.ts` — `IPC_CHANNELS`, `IPC_EVENTS`.

### Known broken connections
(See Section 10 — Issues 1–8.) Most critical: interview execution not wired; InterviewIntelligence lacks candidate/context; desktop IPC missing AI/interview/document/context; preload missing those APIs; context uses mock embeddings.

### Work that must not be repeated
- Directory mapping and file inventory (complete).
- Reading `core/ai/*`, `core/reliability/*`, `core/interview/*`, `core/prompts/*`, `core/context/*`, `core/candidate/*`, `core/documents/*`, `core/models/*`, `core/hardware/*`, `core/vision/*`, `core/audio/*`, `core/conversation/*`, `core/security/*`, `core/analytics/*` (done).
- Reading `desktop/main/*`, `desktop/ipc/*`, `desktop/preload/*` (done).
- Reading `database/client.ts`, `database/schema/*`, `database/repositories/*` (done).
- Reading `server/src/*` (done).
- Running `vitest` on analytics/security/hardware (done, passed).

### Areas requiring additional verification
- Typecheck per-project (timeout issue).
- Lint (`npm run lint`).
- Server route→service→core wiring (unverified).
- Database repository implementation detail (unverified).
- Cloud provider health/credentials (no credentials; must not test paid APIs).
- Local model runtime inference (no model/binaries).

### Recommended next task: P1 persistent memory + production local retrieval.

## P0 IMPLEMENTATION STATUS (COMPLETED)

Commit 9b6cbdb `feat(desktop): connect AI and interview IPC services`:

- P0.2— Desktop AI generation IPC (`desktop/ipc/ai.ipc.ts`): `ai:generate` and `ai:provider-status` handlers with sender validation, Result-shaped outputs, local-first default provider, injected `ipcMain` for testability; registered in `appLifecycle.ts`; exposed as `window.veyra.ai`.
- P0.4— Candidate + Context wiring in `appLifecycle.ts`: in-memory candidate stores, `CandidateContextBuilder`, `CandidateService`, and `ContextEngine` (via `createContextEngine()`) constructed and injected into `InterviewIntelligence`; `getCandidateService()` / `getContextManager()` getters added.
- P0.3/P1.1— Interview IPC (`desktop/ipc/interview.ipc.ts`): `interview:analyze`, `:task`, `:classify`, `:guidance` handlers executing analysis -> candidate -> context -> prompt -> AIRequest -> AI execution; exposed as `window.veyra.interview`.

Tests: 18 new unit tests, all passing; full suite 39/39 passing; `tsc -p tsconfig.desktop.json --noEmit` and `tsc -b` pass.

## P1 IMPLEMENTATION STATUS (COMPLETED)

Commit (pending) `feat(desktop): connect document IPC services`:

- P1 Document intelligence (`desktop/ipc/document.ipc.ts`): `document:pick`, `:import`, `:read`, `:delete`, `:list` handlers with sender validation, Result-shaped outputs, injected `ipcMain` and `dialog` for testability; registered in `appLifecycle.ts`; exposed as `window.veyra.document`.
- `core/documents/storage/InMemoryDocumentStore.ts`: `DocumentStore` implementation (save, getById, delete, exists, updateStatus, list).
- `core/documents/storage/DocumentStore.ts`: added `list()` to the contract.
- `core/documents/DocumentService.ts`: added `getDocumentById()`, `deleteDocument()`, `listDocuments()` + `requireDocumentStore()` helper.
- `desktop/main/appLifecycle.ts`: DocumentService wired with parser registry (Text/HTML/Markdown), InMemoryDocumentStore, ContextDocumentIndexer context sink, AIManagerDocumentAnalyzer AI boundary, CandidateDocumentEvidenceAdapter candidate port; `getDocumentService()` getter added.
- `shared/constants/events.ts`: added `DOCUMENT_IMPORT: "document:import"` channel.

Tests: 13 new document IPC unit tests, all passing; full suite 52/52 passing; `tsc -p tsconfig.desktop.json --noEmit` and `tsc -b` pass.

**Next implementation task:** P1 persistent memory + production local retrieval (embedding/vector store replacement).

---

## 15. INVESTIGATION COVERAGE

### Directories investigated (recursive, within scope)
- `core/` — all 15 subdirectories fully mapped; key files read.
- `shared/` — `constants/`, `contracts/`, `types/`, `validation/` fully mapped; key contracts read.
- `desktop/` — `main/`, `ipc/`, `preload/`, `services/` mapped; key files read.
- `database/` — `client.ts`, `migrations/`, `repositories/`, `schema/` mapped; key files read.
- `server/` — `src/config/`, `src/controllers/`, `src/middleware/`, `src/repositories/`, `src/routes/`, `src/services/`, `src/utils/` mapped; key files read.
- `tests/` — mapped; unit/integration/e2e fixtures/mocks inventory taken.

### Root config files inspected
- `package.json`, `tsconfig.json`, `tsconfig.client.json`, `tsconfig.core.json`, `tsconfig.desktop.json`, `tsconfig.server.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `.env.example` (restored, no secrets retained).

### Excluded directories — NO recursive inspection performed
- `node_modules/` — NOT recursively inspected (only `package.json` version read).
- `.git/` — NOT recursively inspected (only `git status`, `git log`, `git diff` used for baseline).
- `dist/`, `build/`, `out/`, `coverage/`, `.next/`, `.vite/` — NOT inspected.
- `client/` — OUT OF SCOPE per instructions (not investigated).
- Cache/temp/generated/binary/model directories — NOT inspected.

### Files requiring further investigation
- `server/src/services/*.ts` (controller→service→core wiring not confirmed).
- `database/repositories/*.ts` (implementation detail not confirmed).
- `core/documents/analysis/DocumentAIAnalyzer.ts` implementations (abstraction only confirmed).
- `core/audio/` desktop capture adapter (not found; may not exist).
- `desktop/ipc/vision.ipc.ts`, `audio.ipc.ts`, `session.ipc.ts`, `settings.ipc.ts` (exist; handler registration in `index.ts` not fully verified).
- `tests/unit/ai/`, `tests/unit/audio/`, `tests/unit/context/`, `tests/unit/conversation/`, `tests/unit/vision/` (inspected by name only; not executed).
- `tests/integration/*`, `tests/e2e/*` (inspected by name only; not executed).

---

**Report location:** `C:\Users\MATTHEW\Desktop\Veyra\VEYRA_BACKEND_AUDIT.md`

**Recommended first implementation task:** P0.2 — Implement desktop IPC for AI generation (`desktop/ipc/ai.ipc.ts`, register in `desktop/main/index.ts`, expose `veyra.ai` in `desktop/preload/api.ts`).
