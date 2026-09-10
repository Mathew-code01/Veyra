// Relative path: desktop/ipc/hardware.ipc.ts

/**
 * Veyra Hardware IPC
 *
 * Location:
 * desktop/ipc/hardware.ipc.ts
 *
 * MAIN PROCESS ONLY.
 *
 * Renderer requests are limited to:
 *
 *   1. Get cached hardware profile
 *   2. Refresh hardware profile
 *   3. Get hardware-aware model plan
 *
 * The renderer never receives HardwareProfiler or
 * ModelManager instances.
 *
 * Security:
 * - IPC handlers validate their sender state.
 * - Request payloads are treated as untrusted input.
 * - Only the supported `forceRefresh` property is read.
 * - No Node.js objects are exposed to the renderer.
 */

import {
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";

import {
  HARDWARE_IPC_CHANNELS,
  type HardwareGetModelPlanRequest,
  type HardwareGetProfileRequest,
} from "../../shared/contracts/hardware.contract";

import type {
  HardwareModelPlanResponse,
  HardwareSnapshotResponse,
} from "../../shared/types/hardware";

import { HardwareService } from "../services/ai/HardwareService";

export interface RegisterHardwareIpcOptions {
  readonly service: HardwareService;
}

/**
 * Safely converts unknown IPC input into an object.
 *
 * IPC arguments originate from the renderer and must
 * always be considered untrusted.
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
 * Reads the only supported request property.
 *
 * Only the literal boolean `true` enables force refresh.
 * Everything else resolves to false.
 */
function parseForceRefresh(
  value: unknown,
): boolean {
  const request = assertRequestObject(value);

  return request.forceRefresh === true;
}

/**
 * Validates the IPC sender before processing a request.
 *
 * Electron guarantees that an IpcMainInvokeEvent has a
 * sender, but the sender may have been destroyed by the
 * time asynchronous work begins.
 *
 * This check also gives us a legitimate use of the
 * required Electron IPC event parameter.
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
 * Registers hardware IPC handlers.
 *
 * Returns a cleanup function for:
 * - tests
 * - controlled Electron lifecycle management
 * - application shutdown
 */
export function registerHardwareIpc(
  options: RegisterHardwareIpcOptions,
): () => void {
  const service = options.service;

  /**
   * GET_PROFILE
   *
   * Electron handler signature:
   *
   *   (event, request)
   *
   * The event MUST be the first parameter.
   */
  const getProfileHandler = async (
    event: IpcMainInvokeEvent,
    request?: HardwareGetProfileRequest,
  ): Promise<HardwareSnapshotResponse> => {
    assertValidIpcSender(event);

    const forceRefresh = parseForceRefresh(request);

    return service.getSnapshot(forceRefresh);
  };

  /**
   * REFRESH_PROFILE
   */
  const refreshProfileHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<HardwareSnapshotResponse> => {
    assertValidIpcSender(event);

    return service.getSnapshot(true);
  };

  /**
   * GET_MODEL_PLAN
   */
  const getModelPlanHandler = async (
    event: IpcMainInvokeEvent,
    request?: HardwareGetModelPlanRequest,
  ): Promise<HardwareModelPlanResponse> => {
    assertValidIpcSender(event);

    const forceRefresh = parseForceRefresh(request);

    const result =
      await service.getSafeModelPlan(forceRefresh);

    return Object.freeze({
      profile: result.profile,
      plan: result.plan,
    });
  };

  /**
   * Register handlers.
   */
  ipcMain.handle(
    HARDWARE_IPC_CHANNELS.GET_PROFILE,
    getProfileHandler,
  );

  ipcMain.handle(
    HARDWARE_IPC_CHANNELS.REFRESH_PROFILE,
    refreshProfileHandler,
  );

  ipcMain.handle(
    HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN,
    getModelPlanHandler,
  );

  /**
   * Cleanup.
   *
   * Useful for tests and controlled application
   * lifecycle management.
   */
  return () => {
    ipcMain.removeHandler(
      HARDWARE_IPC_CHANNELS.GET_PROFILE,
    );

    ipcMain.removeHandler(
      HARDWARE_IPC_CHANNELS.REFRESH_PROFILE,
    );

    ipcMain.removeHandler(
      HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN,
    );
  };
}