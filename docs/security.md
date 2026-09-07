# Security Model

## Threat model

Veyra handles potentially sensitive resumes, transcripts, screenshots, AI requests, and credentials.

Security goals:

- prevent unauthorized access;
- prevent privilege escalation;
- prevent secret leakage;
- protect local data;
- contain untrusted content.

## Renderer

The renderer is treated as untrusted application content.

Required baseline:

- context isolation;
- disabled Node integration;
- restrictive CSP;
- narrow preload API.

## IPC

Validate every privileged request for:

- schema;
- authorization;
- resource ownership;
- operation;
- file path;
- payload size.

## Secrets

Never expose API keys in React bundles. Use secure credential storage for desktop credentials where available.

## Files

Never execute imported documents or model output as commands. Treat OCR, resumes, job descriptions, and retrieved content as untrusted data.

## Prompt injection

System policies remain authoritative. Model output cannot directly invoke arbitrary privileged operations.

## Capture

Only explicit, supported, user-authorized capture is allowed. No stealth or bypass mechanisms are part of the architecture.

## Logging

Never log by default:

- passwords;
- tokens;
- API keys;
- complete resumes;
- raw transcripts;
- raw screenshots;
- complete sensitive prompts.

## Dependency security

Use lockfiles, automated dependency scanning, updates, and review of critical dependencies.

## Incident response

Contain, rotate credentials, identify affected versions, patch, test, and release a remediation.
