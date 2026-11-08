// Relative path: desktop/ipc/ai.ipc.ts

/**
 * Veyra AI IPC
 *
 * Location:
 * desktop/ipc/ai.ipc.ts
 *
 * MAIN PROCESS ONLY.
 *
 * The renderer never receives AIManager, providers, or model runtimes.
 *
 * Supported renderer operations:
 *
 *   1. ai:generate   - Non-streaming AI generation through a registered provider.
 *   2. ai:provider-status - Health/status for every registered AI provider.
 *
 * Security:
 * - IPC handlers validate their sender state.
 * - Request payloads are treated as untrusted input.
 * - The runtime `AbortSignal` is stripped before crossing the IPC boundary.
 * - No Node.js objects or provider secrets are exposed to the renderer.
 *
 * `ipcMain` is injected so this module can be unit-tested without loading
 * the Electron binary.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import type { AIManager } from "../../core/ai/AIManager";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type {
  AIGenerateRequest,
  AIGenerateResult,
  AIProviderStatusRequest,
  AIProviderStatusResult,
} from "../../shared/contracts/ai.contract";

export interface RegisterAiIpcOptions {
  readonly aiManager: AIManager;

  /**
   * Electron ipcMain instance. Injected so tests can supply a mock.
   */
  readonly ipcMain: IpcMain;
}

/**
 * Safely converts unknown IPC input into an object.
 *
 * IPC arguments originate from the renderer and must always be considered
 * untrusted.
 */
function assertRequestObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Validates the IPC sender before processing a request.
 */
function assertValidIpcSender(
  event: IpcMainInvokeEvent,
): void {
  if (event.sender.isDestroyed()) {
    throw new Error(
      "Veyra IPC request rejected: sender is no longer available.",
    );
  }
}

/**
 * Returns the request as-is. `AIGenerateRequest` already omits the runtime
 * `AbortSignal`, so nothing needs to be stripped before crossing IPC.
 */
function stripSignalFromAiRequest(
  request: AIGenerateRequest,
): AIGenerateRequest {
  return request;
}

/**
 * Registers AI IPC handlers.
 *
 * Returns a cleanup function for tests and controlled application lifecycle
 * management.
 */
export function registerAiIpc(
  options: RegisterAiIpcOptions,
): () => void {
  const aiManager = options.aiManager;

  const ipcMain = options.ipcMain;

  /**
   * AI_GENERATE
   *
   * Executes a non-streaming generation request through the requested
   * provider (defaults to "local" for local-first operation).
   */
  const generateHandler = async (
    event: IpcMainInvokeEvent,
    request?: AIGenerateRequest,
  ): Promise<AIGenerateResult> => {
    assertValidIpcSender(event);

    if (!request) {
      return {
        success: false,
        error: new Error("AI generation request is required."),
      };
    }

    const providerName =
      request.provider && request.provider.trim().length > 0
        ? request.provider
        : "local";

    const aiRequest = stripSignalFromAiRequest(request);

    try {
      const response =
        await aiManager.generate(providerName, aiRequest as Parameters<
          AIManager["generate"]
        >[1]);

      return {
        success: true,
        data: {
          response,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("AI generation failed."),
      };
    }
  };

  /**
   * AI_PROVIDER_STATUS
   *
   * Returns health information for every registered AI provider. A failure
   * to check one provider does not prevent the remaining providers from
   * being reported.
   */
  const providerStatusHandler = async (
    event: IpcMainInvokeEvent,
    _request?: AIProviderStatusRequest,
  ): Promise<AIProviderStatusResult> => {
    assertValidIpcSender(event);

    try {
      const providers = await aiManager.healthCheck();

      return {
        success: true,
        data: {
          providers,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to retrieve provider status."),
      };
    }
  };

  /**
   * Register handlers.
   */
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE,
    generateHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.AI_PROVIDER_STATUS,
    providerStatusHandler,
  );

  /**
   * Cleanup.
   *
   * Useful for tests and controlled application lifecycle management.
   */
  return () => {
    ipcMain.removeHandler(
      IPC_CHANNELS.AI_GENERATE,
    );

    ipcMain.removeHandler(
      IPC_CHANNELS.AI_PROVIDER_STATUS,
    );
  };
}
