# Veyra Documentation

Technical documentation for Veyra, a privacy-first desktop AI interview preparation and assistance application.

## Documentation

- [Architecture](./architecture.md) — system architecture and boundaries
- [Client](./client.md) — React frontend architecture
- [Desktop](./desktop.md) — Electron architecture and security
- [Server](./server.md) — optional backend/API architecture
- [AI Pipeline](./ai-pipeline.md) — AI orchestration
- [Audio Pipeline](./audio-pipeline.md) — audio and transcription
- [Vision Pipeline](./vision-pipeline.md) — authorized visual analysis
- [Conversation Engine](./conversation-engine.md) — conversation intelligence
- [RAG](./rag.md) — retrieval-augmented generation
- [Database](./database.md) — persistence design
- [Security](./security.md) — security model
- [Privacy](./privacy.md) — data lifecycle
- [Performance](./performance.md) — performance targets
- [Testing](./testing.md) — testing strategy
- [Release](./release.md) — release process
- [Development](./development.md) — developer setup

## Core rule

The codebase is the implementation source of truth. Update the relevant documentation whenever an architectural decision changes.

## Security boundary

```text
React
  ↓
Preload API
  ↓
Electron IPC
  ↓
Privileged desktop services
  ↓
Core/domain services
  ↓
Local database / AI providers
```

Renderer code must never receive unrestricted Node.js or Electron capabilities.

## Privacy boundary

Audio, screen, and visual capture are user-authorized operations. Veyra does not implement stealth capture or mechanisms intended to bypass OS, browser, meeting-platform, or screen-sharing controls.
