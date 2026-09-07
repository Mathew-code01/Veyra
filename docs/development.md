# Development Guide

## Requirements

Recommended:

- Windows 10/11, macOS, or Linux;
- Node.js version compatible with `package.json`;
- npm;
- Git;
- optional Ollama;
- platform build prerequisites for installers.

## Install

From the Veyra root:

```bash
npm install
```

## Environment

Windows:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Never commit `.env`.

## Development

Start Vite:

```bash
npm run dev
```

Start Vite and Electron:

```bash
npm run dev:electron
```

## Quality

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Formatting:

```bash
npm run format
```

## Local models

Check Ollama:

```bash
npm run setup:models
```

Explicitly install the recommended model:

```bash
npm run setup:models -- --pull --model llama3.2
```

Ollama is optional.

## Benchmarks

```bash
npm run benchmark
npm run benchmark:audio
npm run benchmark:vision
```

Use only approved fixtures.

## Git

Prefer focused commits:

```text
feat: add interview session state
fix: handle transcription timeout
refactor: isolate provider contract
test: add question classifier coverage
docs: update audio pipeline
```

Before a pull request:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Standards

- TypeScript strict mode.
- Prefer `unknown` over `any`.
- Validate external input.
- Keep functions focused.
- Avoid hidden global state.
- Keep secrets out of client code.
- Do not bypass OS/security controls.

## Troubleshooting

### Node types unavailable

Ensure `@types/node` is installed and relevant TypeScript configurations include Node types. Standalone Node scripts can also use a file-level Node type reference.

### Electron fails

Confirm Vite is reachable and the Electron entry point matches the build output.

### Ollama unavailable

```bash
ollama --version
ollama list
```

### Build errors

Run typecheck first, then lint, then the build. Fix the first deterministic compiler error before investigating downstream errors.
