# Client Architecture

## Responsibility

The React application is the presentation layer.

It handles:

- routing;
- page composition;
- feature UI;
- user interaction;
- local UI state;
- session presentation;
- transcript rendering;
- question and answer rendering;
- settings;
- accessibility.

It does not directly access Node.js APIs.

## Structure

```text
client/src/
├── app/
├── pages/
├── features/
├── components/
├── hooks/
├── stores/
├── services/
├── lib/
└── styles/
```

## State

Use component state for temporary UI state and feature/global stores for shared application state.

Avoid multiple stores owning the same authoritative value.

## IPC

Renderer code communicates through the typed preload API:

```ts
window.veyra.ai.generate(request)
```

Never use unrestricted:

```ts
require("electron")
require("fs")
require("child_process")
```

## Async states

Every async feature should account for:

- idle;
- loading;
- success;
- empty;
- cancelled;
- error.

## Accessibility

Interactive elements require labels, keyboard access, visible focus, appropriate semantics, and usable contrast.

Realtime transcript updates should avoid excessive DOM churn and unnecessary screen-reader announcements.

## Performance

Long transcripts should use virtualization or bounded rendering. Streaming AI output should update incrementally rather than reconstructing the entire interface for every token.
