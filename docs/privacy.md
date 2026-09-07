# Privacy and Data Lifecycle

## Principles

Veyra follows:

- data minimization;
- explicit user control;
- local-first processing;
- configurable retention;
- transparent cloud processing;
- secure cleanup;
- minimal telemetry.

## Data classes

### Candidate data

Resume, profile, skills, experience, projects, and stories.

### Session data

Transcript, questions, answers, metrics, and optional capture metadata.

### Temporary data

Audio buffers, intermediate images, OCR output, and provider artifacts.

### Credentials

Provider API keys and authentication credentials.

## Lifecycle

```text
Collect only when needed
 ↓
Process
 ↓
Persist only when necessary
 ↓
Retain according to policy
 ↓
Delete/expire
```

## Cloud processing

When cloud AI is selected, the user should be informed that relevant data is sent to the configured provider.

## Local mode

When local models support the requested capability, the application can process data without sending it to a cloud AI provider.

## Telemetry

Telemetry should be opt-in and data-minimized. Diagnostic events should not contain raw interview content.

## Deletion

Deleting a source must include derived indexes and temporary artifacts.

## User controls

Settings should expose:

- AI provider preference;
- cloud/local processing;
- session retention;
- capture retention;
- diagnostics;
- credential management;
- clear-data controls.

## Third-party limits

Veyra cannot control the privacy policies of external meeting platforms or AI providers. Their policies remain applicable when their services are used.
