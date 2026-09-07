# Veyra Architecture

## Purpose

Veyra combines a React interface, Electron desktop runtime, shared contracts, core AI/domain services, local persistence, and optional server/provider integrations.

## High-level design

```text
┌─────────────────────────────────────────────┐
│ React Client                                │
│ pages / features / hooks / stores / UI     │
└──────────────────────┬──────────────────────┘
                       │ typed API
┌──────────────────────▼──────────────────────┐
│ Electron Preload                            │
│ narrow and validated IPC surface            │
└──────────────────────┬──────────────────────┘
                       │ IPC
┌──────────────────────▼──────────────────────┐
│ Electron Main                               │
│ windows / permissions / filesystem / OS     │
└──────────────┬────────────────┬─────────────┘
               │                │
        ┌──────▼───────┐  ┌────▼────────────┐
        │ Core Engine  │  │ SQLite/Drizzle  │
        │ AI/audio/RAG │  │ local data      │
        │ vision/domain│  │                 │
        └──────┬───────┘  └─────────────────┘
               │
        ┌──────▼─────────────────────────────┐
        │ Provider adapters                   │
        │ Gemini / Ollama / Whisper / Mock   │
        └────────────────────────────────────┘
```

## Responsibilities

### Client

Owns presentation, navigation, interaction state, accessibility, and user feedback.

### Desktop

Owns privileged operations: windows, IPC, permissions, filesystem, capture, audio devices, credentials, lifecycle, updates, and crash handling.

### Core

Owns provider-independent business logic and orchestration.

### Database

Owns persistence behind repositories.

### Server

Provides optional remote synchronization, orchestration, or API functionality.

## Request lifecycle

1. User submits an operation.
2. Client performs basic validation.
3. Preload forwards a typed request.
4. Main process validates the request again.
5. Domain service performs the operation.
6. Context is retrieved if needed.
7. AI/provider routing occurs.
8. Reliability policies are applied.
9. Provider response is normalized.
10. Metrics are recorded.
11. UI receives a safe result.

## Architectural rules

- No React imports in core.
- No arbitrary Node access in renderer.
- No secrets in client bundles.
- Validate every external boundary.
- Keep provider-specific code behind adapters.
- Use bounded queues for realtime processing.
- Keep sensitive data retention explicit.
