// ============================================================================
// FILE: desktop/ipc/audio-runtime.ipc.ts
// PURPOSE:
// IPC handlers connecting live audio capture/transcription to the unified
// interview runtime.
//
// MAIN PROCESS ONLY.
//
// Channels:
//   AUDIO_RUNTIME_SESSION_START   - create/start a live bridge for a session
//   AUDIO_RUNTIME_SESSION_STOP    - stop the bridge for a session
//   AUDIO_RUNTIME_SESSION_STATE   - get bridge + runtime state for a session
//   AUDIO_TRANSCRIPT_SUBMIT       - submit transcript text directly to runtime
//                                   (no microphone; used for testing)
//
// SECURITY:
// - IPC handlers validate their sender state.
// - Only transcript text (never raw audio) reaches the runtime/renderer.
// - Profile/session isolation is enforced through the runtime.
// ============================================================================

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type { Result } from "../../shared/types/common";

import type { UnifiedInterviewRuntime } from "../../core/interview/runtime/UnifiedInterviewRuntime";
import type { TranscriptionAdapter } from "../../core/audio/TranscriptionAdapter";

import { AudioCaptureLifecycle } from "../audio/AudioCaptureLifecycle";
import { AudioTranscriptionBridge } from "../audio/AudioTranscriptionBridge";

// ============================================================================
// TYPES
// ============================================================================

export interface RegisterAudioRuntimeIpcOptions {
  readonly ipcMain: IpcMain;

  readonly runtime: UnifiedInterviewRuntime;

  /**
   * Factory for the capture lifecycle. Defaults to a real
   * AudioCaptureLifecycle backed by DesktopAudioCapture. Tests inject a mock.
   */
  readonly createCaptureLifecycle?: () => AudioCaptureLifecycle;

  /**
   * Factory for the transcription adapter. When omitted, microphone-to-runtime
   * transcription is unavailable rather than returning fabricated text.
   */
  readonly createTranscriptionAdapter?: () => TranscriptionAdapter;

  readonly getActiveProfileId: () => string | undefined;
}

interface AudioRuntimeBridgeHandle {
  readonly sessionId: string;
  readonly bridge: AudioTranscriptionBridge;
}

function assertValidIpcSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Veyra IPC request rejected: sender is no longer available.");
  }
}

function assertRequestObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function registerAudioRuntimeIpc(
  options: RegisterAudioRuntimeIpcOptions,
): () => void {
  const { ipcMain, runtime, getActiveProfileId } = options;

  const createCaptureLifecycle =
    options.createCaptureLifecycle ?? (() => new AudioCaptureLifecycle());

  const bridges = new Map<string, AudioRuntimeBridgeHandle>();

  const requireProfile = (event: IpcMainInvokeEvent): string => {
    assertValidIpcSender(event);
    const profileId = getActiveProfileId();
    if (!profileId) {
      throw new Error("An active candidate profile is required.");
    }
    return profileId;
  };

  const getOrCreateBridge = async (
    sessionId: string,
    consentGiven: boolean,
  ): Promise<AudioTranscriptionBridge> => {
    let handle = bridges.get(sessionId);
    if (!handle) {
      if (!options.createTranscriptionAdapter) {
        throw new Error(
          "Audio transcription is unavailable: no transcription provider is configured.",
        );
      }
      const captureLifecycle = createCaptureLifecycle();
      const transcriptionAdapter = options.createTranscriptionAdapter();
      const bridge = new AudioTranscriptionBridge({
        runtime,
        captureLifecycle,
        transcriptionAdapter,
        sessionId,
        consentGiven,
      });
      handle = { sessionId, bridge };
      bridges.set(sessionId, handle);
    }
    return handle.bridge;
  };

  const removeBridge = (sessionId: string): void => {
    bridges.delete(sessionId);
  };

  // --------------------------------------------------------------------------
  // AUDIO_RUNTIME_SESSION_START
  // --------------------------------------------------------------------------

  const startHandler = async (
    event: IpcMainInvokeEvent,
    request?: unknown,
  ): Promise<{ readonly success: boolean; readonly data?: unknown; readonly error?: Error }> => {
    try {
      requireProfile(event);
      const input = assertRequestObject(request);
      const sessionId =
        typeof input.sessionId === "string" && input.sessionId.trim()
          ? input.sessionId.trim()
          : `audio-runtime-${Date.now()}`;
      const consentGiven = input.consentGiven === true;

      const bridge = await getOrCreateBridge(sessionId, consentGiven);
      await bridge.start();

      return { success: true, data: bridge.state };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to start audio runtime session."),
      };
    }
  };

  // --------------------------------------------------------------------------
  // AUDIO_RUNTIME_SESSION_STOP
  // --------------------------------------------------------------------------

  const stopHandler = async (
    event: IpcMainInvokeEvent,
    request?: unknown,
  ): Promise<{ readonly success: boolean; readonly data?: unknown; readonly error?: Error }> => {
    try {
      requireProfile(event);
      const input = assertRequestObject(request);
      const sessionId =
        typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) {
        return { success: false, error: new Error("sessionId is required.") };
      }

      const handle = bridges.get(sessionId);
      if (!handle) {
        return { success: false, error: new Error("Audio runtime session not found.") };
      }

      await handle.bridge.stop();
      removeBridge(sessionId);

      return { success: true, data: { sessionId } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to stop audio runtime session."),
      };
    }
  };

  // --------------------------------------------------------------------------
  // AUDIO_RUNTIME_SESSION_STATE
  // --------------------------------------------------------------------------

  const stateHandler = async (
    event: IpcMainInvokeEvent,
    request?: unknown,
  ): Promise<{ readonly success: boolean; readonly data?: unknown; readonly error?: Error }> => {
    try {
      requireProfile(event);
      const input = assertRequestObject(request);
      const sessionId =
        typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      if (!sessionId) {
        return { success: false, error: new Error("sessionId is required.") };
      }

      const handle = bridges.get(sessionId);
      if (!handle) {
        return { success: false, error: new Error("Audio runtime session not found.") };
      }

      return { success: true, data: handle.bridge.state };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to get audio runtime session state."),
      };
    }
  };

  // --------------------------------------------------------------------------
  // AUDIO_TRANSCRIPT_SUBMIT (no microphone; testing/keyboard input)
  // --------------------------------------------------------------------------

  const submitHandler = async (
    event: IpcMainInvokeEvent,
    request?: unknown,
  ): Promise<{ readonly success: boolean; readonly data?: unknown; readonly error?: Error }> => {
    try {
      requireProfile(event);
      const input = assertRequestObject(request);
      const sessionId =
        typeof input.sessionId === "string" ? input.sessionId.trim() : "";
      const text = typeof input.text === "string" ? input.text : "";
      if (!sessionId || !text.trim()) {
        return { success: false, error: new Error("sessionId and text are required.") };
      }

      const result = await runtime.processQuestion({
        sessionId,
        text,
        source: "voice_transcript",
        generateAI: false,
      });

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error("Failed to submit transcript to runtime."),
      };
    }
  };

  ipcMain.handle(IPC_CHANNELS.AUDIO_RUNTIME_SESSION_START, startHandler);
  ipcMain.handle(IPC_CHANNELS.AUDIO_RUNTIME_SESSION_STOP, stopHandler);
  ipcMain.handle(IPC_CHANNELS.AUDIO_RUNTIME_SESSION_STATE, stateHandler);
  ipcMain.handle(IPC_CHANNELS.AUDIO_TRANSCRIPT_SUBMIT, submitHandler);

  return () => {
    for (const ch of [
      IPC_CHANNELS.AUDIO_RUNTIME_SESSION_START,
      IPC_CHANNELS.AUDIO_RUNTIME_SESSION_STOP,
      IPC_CHANNELS.AUDIO_RUNTIME_SESSION_STATE,
      IPC_CHANNELS.AUDIO_TRANSCRIPT_SUBMIT,
    ]) {
      ipcMain.removeHandler(ch);
    }
    for (const handle of bridges.values()) {
      void handle.bridge.dispose();
    }
    bridges.clear();
  };
}
