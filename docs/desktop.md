# Electron Desktop Architecture

## Responsibilities

Electron provides:

- application lifecycle;
- windows;
- secure preload;
- IPC;
- OS permissions;
- authorized capture;
- audio-device access;
- filesystem services;
- secure credential access;
- tray;
- updates;
- crash handling.

## Renderer security

Production windows should use:

- `contextIsolation: true`
- `nodeIntegration: false`
- sandboxing where compatible
- restrictive Content Security Policy
- narrow preload APIs

## IPC

Every IPC channel needs:

1. a known channel name;
2. request validation;
3. response typing;
4. authorization;
5. safe error handling;
6. cancellation where appropriate.

Do not expose a generic arbitrary-command IPC bridge.

## Filesystem

Renderer-supplied paths are untrusted. File services must enforce allowed directories and operations.

Temporary files should have an owner, creation timestamp, cleanup policy, and bounded lifetime.

## Capture

Capture is explicitly user-controlled and uses supported OS mechanisms. Veyra does not attempt to conceal capture from users or other software.

## Permissions

Microphone and capture permissions must be checked before starting dependent features. Permission failures should be recoverable.

## Lifecycle

Shutdown should:

1. stop active sessions;
2. stop capture/audio;
3. flush required persistence;
4. close database resources;
5. destroy windows;
6. unregister listeners;
7. release temporary resources.
