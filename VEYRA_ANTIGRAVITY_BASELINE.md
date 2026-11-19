# Veyra Antigravity Baseline Report

**Date:** 2026-11-10  
**Project:** Veyra — AI Interview Copilot Desktop & Server Platform  
**Root:** `C:\Users\MATTHEW\Desktop\Veyra`  
**Branch:** `main`  
**HEAD:** `e90a6243348ace2ca58f1b531e1ad1cab404b2f2`  
**Upstream:** `origin/main` (Synchronized: 0 ahead, 0 behind)  
**Git Index:** Clean (0 staged files)  
**Worktree Status:** 94 modified, deleted, or untracked paths (preserved intact)  

---

## 1. Verified Baseline Checks

| Check | Command | Result | Notes |
|---|---|---|---|
| Vitest Root Test Suite | `npm test` | **PASSED** (178 / 178 tests across 30 files) | Duration ~92s. Keyword-only fallback, SQLite vectors, document store, candidate repo, memory FTS5, cloud policy all pass. |
| TypeScript Project References | `npm run typecheck` (`tsc -b`) | **PASSED** (0 errors) | Validated client, desktop, server, and core project references. |
| Server Control-Plane Test Suite | `npm --prefix server test` | **PASSED** (7 / 7 tests) | Validated token auth, billing webhooks, checkout idempotency, cloud AI gate. |
| Database Migration Pipeline | Tested in Vitest (`database/migrations.test.ts`) | **PASSED** (4 / 4 tests) | Validated `0000_initial.sql` through `0007_memory_candidate_scope.sql`. |

---

## 2. Baseline Architecture Map

- **AI Execution & Cloud Gateway (`core/ai/`, `core/cloud/`):**
  - Central `AIManager` and `AIRouter`.
  - `CloudExecutionPolicy` denies cloud execution by default unless explicit external-processing consent and exact model pricing/classification exist.
  - `SecureCloudCredentialResolver` resolves BYOK credentials from OS-backed secure credential vault, falling back to environment variables.
- **Candidate & Evidence (`database/repositories/`, `core/candidate/`):**
  - `CandidateRepository` implements SQLite persistence for profiles, experiences, skills, projects, and stories.
  - `CandidateEvidenceRepository` stores extracted facts tied to source documents.
  - Active profile ownership enforced in main process (`desktop/main/activeProfile.ts`).
- **Context & Memory (`core/context/`, `database/repositories/`):**
  - Keyword-only lexical search is primary fallback when ONNX embedding model/tokenizer is absent (`KeywordSearch.ts`).
  - Persistent SQLite vector storage (`SqliteVectorStore.ts`).
  - Persistent SQLite memory repository (`memoryRepository.ts`) with FTS5 search and expiration.
- **Document Processing (`core/documents/`, `desktop/ipc/`):**
  - Secure document picker handles file imports via opaque tokens.
  - Parsers for TXT, Markdown, HTML exist; PDF and DOCX adapters require inspection.
- **Server Control-Plane (`server/`):**
  - Express app with Helmet, CORS, rate limiting, and Zod validation.
  - API routes for `/api/v1/plans`, `/api/v1/account`, `/api/v1/auth/session`, `/api/v1/devices`, `/api/v1/billing/*`, `/api/v1/ai/*`.
  - Identity provider token verification contract in place; currently mock adapter in test.

---

## 3. Preservation Notice

All existing worktree modifications, uncommitted files, and test suites are preserved. No destructive Git commands (`git reset`, `git clean`) were used.
