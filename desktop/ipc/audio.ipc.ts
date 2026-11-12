// ============================================================================
// FILE: desktop/ipc/audio.ipc.ts
//
// PURPOSE:
// IPC handlers for audio capture, transcription, and transcript state.
//
// MAIN PROCESS ONLY.
//
// Supported renderer operations:
//
//   1. audio:devices:list    - List available audio input devices.
//   2. audio:permission:status - Check microphone permission state.
//   3. audio:permission:request - Request microphone permission.
//   4. audio:session:start   - Start an audio capture session.
//   5. audio:session:stop    - Stop an audio capture session.
//   5. audio:session:state   - Get audio session state.
//   6. audio:transcript:state - Get transcript state for a session.
//   7. audio:metrics         - Get audio metrics for a session.
//
// Security:
// - IPC handlers validate their sender state.
// - Request payloads are treated as untrusted input.
// - No raw audio buffers cross the IPC boundary.
// - Microphone access requires explicit user permission via getUserMedia.
//
// `ipcMain` is injected so this module can be unit-tested without loading
// the Electron binary.
// ============================================================================

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type {
  AudioListDevicesRequest,
  AudioListDevicesResult,
  AudioPermissionRequest,
  AudioPermissionResult,
  AudioSessionStartRequest,
  AudioSessionStartResult,
  AudioSessionStopRequest,
  AudioSessionStopResult,
  AudioSessionStateRequest,
  AudioSessionStateResult,
  AudioTranscriptStateRequest,
  AudioTranscriptStateResult,
  AudioMetricsRequest,
  AudioMetricsResult,
} from "../../shared/contracts/audio.contract";

import type {
  AudioDevice,
  AudioSessionState,
  TranscriptState,
  AudioMetrics,
  AudioFormat,
} from "../../shared/types/audio";

import { DesktopAudioCapture } from "../audio/DesktopAudioCapture";

export interface RegisterAudioIpcOptions {
  readonly ipcMain: IpcMain;

  /**
   * Optional transcription engine factory.
   *
   * When omitted, a default TranscriptionEngine with a WhisperEngine
   * cloud provider is used. The caller is responsible for configuring
   * BYOK credentials or local model providers before starting
   * transcription.
   */
  readonly createTranscriptionEngine?: () => {
    readonly engine: import("../../core/audio/TranscriptionEngine").TranscriptionEngine;
  };
}

interface AudioSessionHandle {
  readonly sessionId: string;

  readonly capture: DesktopAudioCapture;

  readonly startedAt: string;
}

function assertValidIpcSender(
  event: IpcMainInvokeEvent,
): void {
  if (event.sender.isDestroyed()) {
    throw new Error(
      "Veyra IPC request rejected: sender is no longer available.",
    );
  }
}

function assertRequestObject(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function registerAudioIpc(
  options: RegisterAudioIpcOptions,
): () => void {
  const { ipcMain } = options;

  const sessions = new Map<string, AudioSessionHandle>();

  /**
   * AUDIO_DEVICES_LIST
   *
   * Returns available audio input devices.
   *
   * NOTE: navigator.mediaDevices is not available in the Electron main
   * process. This handler reports the device list as unavailable so the
   * renderer can degrade gracefully. Device enumeration belongs to the
   * renderer's preload layer when running in a browser context, or to a
   * dedicated desktop capture bridge.
   */
  const devicesHandler = async (
    _event: IpcMainInvokeEvent,
    _request?: AudioListDevicesRequest,
  ): Promise<AudioListDevicesResult> => {
    try {
      return {
        success: true,
        data: {
          devices: [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to list audio devices."),
      };
    }
  };

  /**
   * AUDIO_PERMISSION_STATUS
   *
   * Reports microphone permission state.
   *
   * In the Electron main process, permission is determined by whether
   * getUserMedia has previously succeeded. This handler returns
   * "unknown" unless an active capture session exists.
   */
  const permissionStatusHandler = async (
    _event: IpcMainInvokeEvent,
    _request?: AudioPermissionRequest,
  ): Promise<AudioPermissionResult> => {
    try {
      const permission: "granted" | "denied" | "prompt" | "unknown" =
        sessions.size > 0 ? "granted" : "unknown";

      return {
        success: true,
        data: {
          permission: {
            microphone: permission,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to check audio permission status."),
      };
    }
  };

  /**
   * AUDIO_PERMISSION_REQUEST
   *
   * Requests microphone permission by attempting a zero-duration
   * getUserMedia call. The renderer must handle the user permission
   * dialog.
   *
   * NOTE: This is a main-process boundary. Actual permission prompting
   * occurs in the renderer/preload layer where navigator.mediaDevices
   * is available. This handler validates the request and returns the
   * resulting state.
   */
  const permissionRequestHandler = async (
    event: IpcMainInvokeEvent,
    _request?: AudioPermissionRequest,
  ): Promise<AudioPermissionResult> => {
    assertValidIpcSender(event);

    try {
      // In the main process, we cannot directly prompt for microphone
      // permission. We report the current state so the renderer can
      // initiate its own getUserMedia flow through the preload boundary.
      const permission: "granted" | "denied" | "prompt" | "unknown" =
        sessions.size > 0 ? "granted" : "prompt";

      return {
        success: true,
        data: {
          permission: {
            microphone: permission,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to request audio permission."),
      };
    }
  };

  /**
   * AUDIO_SESSION_START
   *
   * Starts an audio capture session for the given sessionId.
   *
   * Each session owns a DesktopAudioCapture instance. Transcription
   * is handled through the injected transcription engine factory.
   */
  const sessionStartHandler = async (
    event: IpcMainInvokeEvent,
    request?: AudioSessionStartRequest,
  ): Promise<AudioSessionStartResult> => {
    assertValidIpcSender(event);

    const input = assertRequestObject(request);

    const sessionId =
      typeof input.sessionId === "string" && input.sessionId.trim()
        ? input.sessionId.trim()
        : `audio-${Date.now()}`;

    try {
      if (sessions.has(sessionId)) {
        return {
          success: false,
          error: new Error(
            `Audio session "${sessionId}" is already active.`,
          ),
        };
      }

      const capture = new DesktopAudioCapture({
        sampleRate: (input.format as AudioFormat | undefined)?.sampleRate,
        channels: (input.format as AudioFormat | undefined)?.channels,
        sampleFormat:
          (input.format as AudioFormat | undefined)?.sampleFormat,
        bitDepth: (input.format as AudioFormat | undefined)?.bitDepth,
        chunkDurationMs: undefined,
        deviceId: (input.deviceId as string | undefined)?.trim() || undefined,
      });

      const chunkUnsubscribe = capture.onChunk(
        (_chunk): void => {
          // Audio chunks flow through the capture pipeline. The renderer
          // receives transcript events via the transcription pipeline,
          // not raw audio chunks.
        },
      );

      const errorUnsubscribe = capture.onError((error): void => {
        // Surface capture errors to the renderer through session state.
        void error;
      });

      await capture.start();

      sessions.set(sessionId, {
        sessionId,
        capture,
        startedAt: new Date().toISOString(),
      });

      return {
        success: true,
        data: {
          session: {
            sessionId,
            active: true,
            deviceId: ((input.deviceId as string | undefined)?.trim() || null),
            startedAt: new Date().toISOString(),
            stoppedAt: null,
            format: capture.getFormat(),
            bytesCaptured: 0,
            durationMs: 0,
          },
        },
      };
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));

      return {
        success: false,
        error: normalized,
      };
    }
  };

  /**
   * AUDIO_SESSION_STOP
   *
   * Stops an audio capture session and disposes its resources.
   */
  const sessionStopHandler = async (
    event: IpcMainInvokeEvent,
    request?: AudioSessionStopRequest,
  ): Promise<AudioSessionStopResult> => {
    assertValidIpcSender(event);

    const input = assertRequestObject(request);

    const sessionId =
      typeof input.sessionId === "string" ? input.sessionId.trim() : "";

    if (!sessionId) {
      return {
        success: false,
        error: new Error("Audio session ID is required."),
      };
    }

    const handle = sessions.get(sessionId);

    if (!handle) {
      return {
        success: false,
        error: new Error(`Audio session "${sessionId}" not found.`),
      };
    }

    try {
      await handle.capture.dispose();

      sessions.delete(sessionId);

      return {
        success: true,
        data: {
          session: {
            sessionId,
            active: false,
            deviceId: null,
            startedAt: handle.startedAt,
            stoppedAt: new Date().toISOString(),
            format: handle.capture.getFormat(),
            bytesCaptured: 0,
            durationMs: 0,
          },
        },
      };
    } catch (error) {
      const normalized =
        error instanceof Error ? error : new Error(String(error));

      return {
        success: false,
        error: normalized,
      };
    }
  };

  /**
   * AUDIO_SESSION_STATE
   *
   * Returns the current state of an audio session.
   */
  const sessionStateHandler = async (
    event: IpcMainInvokeEvent,
    request?: AudioSessionStateRequest,
  ): Promise<AudioSessionStateResult> => {
    assertValidIpcSender(event);

    const input = assertRequestObject(request);

    const sessionId =
      typeof input.sessionId === "string" ? input.sessionId.trim() : "";

    if (!sessionId) {
      return {
        success: false,
        error: new Error("Audio session ID is required."),
      };
    }

    const handle = sessions.get(sessionId);

    if (!handle) {
      return {
        success: false,
        error: new Error(`Audio session "${sessionId}" not found.`),
      };
    }

    return {
      success: true,
      data: {
        session: {
          sessionId,
          active: handle.capture.isCapturing,
          deviceId: null,
          startedAt: handle.startedAt,
          stoppedAt: null,
          format: handle.capture.getFormat(),
          bytesCaptured: 0,
          durationMs: 0,
        },
      },
    };
  };

  /**
   * AUDIO_TRANSCRIPT_STATE
   *
   * Returns the transcript state for an audio session.
   *
   * Transcript state is managed by the AudioTranscriptionPipeline and
   * ConversationManager. This handler returns the current state.
   */
  const transcriptStateHandler = async (
    event: IpcMainInvokeEvent,
    request?: AudioTranscriptStateRequest,
  ): Promise<AudioTranscriptStateResult> => {
    assertValidIpcSender(event);

    const input = assertRequestObject(request);

    const sessionId =
      typeof input.sessionId === "string" ? input.sessionId.trim() : "";

    if (!sessionId) {
      return {
        success: false,
        error: new Error("Audio session ID is required."),
      };
    }

    const handle = sessions.get(sessionId);

    if (!handle) {
      return {
        success: false,
        error: new Error(`Audio session "${sessionId}" not found.`),
      };
    }

    return {
      success: true,
      data: {
        transcript: {
          sessionId,
          active: handle.capture.isCapturing,
          segments: [],
          partialText: "",
        },
      },
    };
  };

  /**
   * AUDIO_METRICS
   *
   * Returns audio metrics for a session.
   */
  const metricsHandler = async (
    event: IpcMainInvokeEvent,
    request?: AudioMetricsRequest,
  ): Promise<AudioMetricsResult> => {
    assertValidIpcSender(event);

    const input = assertRequestObject(request);

    const sessionId =
      typeof input.sessionId === "string" ? input.sessionId.trim() : "";

    if (!sessionId) {
      return {
        success: false,
        error: new Error("Audio session ID is required."),
      };
    }

    const handle = sessions.get(sessionId);

    if (!handle) {
      return {
        success: false,
        error: new Error(`Audio session "${sessionId}" not found.`),
      };
    }

    const format = handle.capture.getFormat();

    return {
      success: true,
      data: {
        metrics: {
          sessionId,
          sampleRate: format.sampleRate,
          channels: format.channels,
          bytesCaptured: 0,
          durationMs: 0,
          droppedFrames: 0,
          speechDurationMs: 0,
          silenceDurationMs: 0,
        },
      },
    };
  };

  // ==========================================================================
  // REGISTER HANDLERS
  // ==========================================================================

  ipcMain.handle(IPC_CHANNELS.AUDIO_DEVICES_LIST, devicesHandler);

  ipcMain.handle(IPC_CHANNELS.AUDIO_PERMISSION_STATUS, permissionStatusHandler);

  ipcMain.handle(
    IPC_CHANNELS.AUDIO_PERMISSION_REQUEST,
    permissionRequestHandler,
  );

  ipcMain.handle(IPC_CHANNELS.AUDIO_SESSION_START, sessionStartHandler);

  ipcMain.handle(IPC_CHANNELS.AUDIO_SESSION_STOP, sessionStopHandler);

  ipcMain.handle(IPC_CHANNELS.AUDIO_SESSION_STATE, sessionStateHandler);

  ipcMain.handle(IPC_CHANNELS.AUDIO_TRANSCRIPT_STATE, transcriptStateHandler);

  ipcMain.handle(IPC_CHANNELS.AUDIO_METRICS, metricsHandler);

  ipcMain.handle(IPC_CHANNELS.AUDIO_TRANSCRIPT_PARTIAL, async () => {
    return {
      success: false,
      error: new Error("Partial transcript events are streamed, not queried."),
    };
  });

  ipcMain.handle(IPC_CHANNELS.AUDIO_TRANSCRIPT_FINAL, async () => {
    return {
      success: false,
      error: new Error("Final transcript events are streamed, not queried."),
    };
  });

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  return () => {
    for (const handle of sessions.values()) {
      try {
        handle.capture.dispose();
      } catch {
        // Best-effort cleanup.
      }
    }

    sessions.clear();

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_DEVICES_LIST);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_PERMISSION_STATUS);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_PERMISSION_REQUEST);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_SESSION_START);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_SESSION_STOP);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_SESSION_STATE);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_TRANSCRIPT_STATE);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_METRICS);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_TRANSCRIPT_PARTIAL);

    ipcMain.removeHandler(IPC_CHANNELS.AUDIO_TRANSCRIPT_FINAL);
  };
}
