// Relative path: desktop/ipc/memory.ipc.ts

/**
 * Veyra Memory IPC
 *
 * Location:
 * desktop/ipc/memory.ipc.ts
 *
 * MAIN PROCESS ONLY.
 *
 * The renderer never receives MemoryRepository, database connections, or
 * privileged objects.
 *
 * Supported renderer operations:
 *
 *   1. memory:search   - Keyword/filtered search over persistent memory
 *                        (FTS5 where available, profile-scoped).
 *   2. memory:list     - List memory records for a profile.
 *   3. memory:create   - Create a durable memory record.
 *   4. memory:update   - Update a memory record (e.g. approve a preference,
 *                        fix confidence, flag a contradiction).
 *   5. memory:delete   - Soft-delete a memory record.
 *
 * Security:
 * - IPC handlers validate their sender state.
 * - Every memory operation is scoped to profileId supplied in the request,
 *   enforcing profile isolation in the main process.
 * - Request payloads are treated as untrusted input.
 * - No database connections are exposed to the renderer.
 *
 * `ipcMain` is injected so this module can be unit-tested without loading
 * Electron.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { MemoryRepository } from "../../database/repositories/memoryRepository";

import type {
  MemoryCategory,
  MemorySearchOptions,
  MemoryVerificationStatus,
} from "../../database/repositories/memoryRepository";

import { IPC_CHANNELS } from "../../shared/constants/events";

export interface RegisterMemoryIpcOptions {
  readonly memoryRepository: MemoryRepository;

  readonly ipcMain: IpcMain;
}

/**
 * Memory search request received across IPC.
 */
export interface MemorySearchRequest {
  readonly profileId: string;

  readonly query?: string;

  readonly category?: MemoryCategory;

  readonly sourceType?: string;

  readonly sourceId?: string;

  readonly minConfidence?: number;

  readonly limit?: number;
}

/**
 * Memory list request received across IPC.
 */
export interface MemoryListRequest {
  readonly profileId: string;

  readonly category?: MemoryCategory;

  readonly limit?: number;
}

/**
 * Memory create request received across IPC.
 */
export interface MemoryCreateRequest {
  readonly profileId: string;

  readonly category: MemoryCategory;

  readonly content: { readonly value: unknown; readonly text?: string };

  readonly sourceType: string;

  readonly sourceId?: string;

  readonly sourceName?: string;

  readonly confidence?: number;

  readonly verificationStatus?: MemoryVerificationStatus;

  readonly extractionVersion?: string;

  readonly expiresAt?: string;
}

/**
 * Memory update request received across IPC.
 */
export interface MemoryUpdateRequest {
  readonly profileId: string;

  readonly memoryId: string;

  readonly category?: MemoryCategory;

  readonly content?: { readonly value: unknown; readonly text?: string };

  readonly sourceType?: string;

  readonly sourceId?: string;

  readonly sourceName?: string;

  readonly confidence?: number;

  readonly verificationStatus?: MemoryVerificationStatus;

  readonly extractionVersion?: string;

  readonly expiresAt?: string;

  readonly status?: "active" | "expired" | "deleted" | "flagged";
}

/**
 * Memory delete request received across IPC.
 */
export interface MemoryDeleteRequest {
  readonly profileId: string;

  readonly memoryId: string;
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
 * Registers Memory IPC handlers.
 *
 * Returns a cleanup function for tests and controlled application lifecycle
 * management.
 */
export function registerMemoryIpc(
  options: RegisterMemoryIpcOptions,
): () => void {
  const memoryRepository = options.memoryRepository;

  const ipcMain = options.ipcMain;

  /**
   * MEMORY_SEARCH
   *
   * Keyword/filtered search over persistent memory, scoped to profileId.
   */
  const searchHandler = async (
    event: IpcMainInvokeEvent,
    request?: MemorySearchRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: readonly unknown[];

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.profileId?.trim()) {
      return {
        success: false,

        error: new Error("A profileId is required."),
      };
    }

    try {
      const options: MemorySearchOptions = {
        query: request.query,

        category: request.category,

        sourceType: request.sourceType,

        sourceId: request.sourceId,

        minConfidence: request.minConfidence,

        limit: request.limit,
      };

      const records = memoryRepository.search(request.profileId, options);

      return {
        success: true,

        data: records,
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Memory search failed."),
      };
    }
  };

  /**
   * MEMORY_LIST
   *
   * Lists memory records for a profile.
   */
  const listHandler = async (
    event: IpcMainInvokeEvent,
    request?: MemoryListRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: readonly unknown[];

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.profileId?.trim()) {
      return {
        success: false,

        error: new Error("A profileId is required."),
      };
    }

    try {
      const records = memoryRepository.listByProfile(request.profileId, {
        category: request.category,

        limit: request.limit,
      });

      return {
        success: true,

        data: records,
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Memory list failed."),
      };
    }
  };

  /**
   * MEMORY_CREATE
   *
   * Creates a durable memory record scoped to profileId.
   */
  const createHandler = async (
    event: IpcMainInvokeEvent,
    request?: MemoryCreateRequest,
  ): Promise<{
    readonly success: boolean;

    readonly data?: { readonly memoryId: string };

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.profileId?.trim()) {
      return {
        success: false,

        error: new Error("A profileId is required."),
      };
    }

    if (!request.category) {
      return {
        success: false,

        error: new Error("A memory category is required."),
      };
    }

    try {
      const record = memoryRepository.create({
        profileId: request.profileId,

        category: request.category,

        content: request.content,

        sourceType: request.sourceType,

        sourceId: request.sourceId,

        sourceName: request.sourceName,

        confidence: request.confidence,

        verificationStatus: request.verificationStatus,

        extractionVersion: request.extractionVersion,

        expiresAt: request.expiresAt,
      });

      return {
        success: true,

        data: {
          memoryId: record.id,
        },
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Memory create failed."),
      };
    }
  };

  /**
   * MEMORY_UPDATE
   *
   * Updates a memory record scoped to profileId.
   */
  const updateHandler = async (
    event: IpcMainInvokeEvent,
    request?: MemoryUpdateRequest,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.profileId?.trim()) {
      return {
        success: false,

        error: new Error("A profileId is required."),
      };
    }

    if (!request.memoryId?.trim()) {
      return {
        success: false,

        error: new Error("A memoryId is required."),
      };
    }

    try {
      const updated = memoryRepository.update(
        request.memoryId,

        request.profileId,

        {
          category: request.category,

          content: request.content,

          sourceType: request.sourceType,

          sourceId: request.sourceId,

          sourceName: request.sourceName,

          confidence: request.confidence,

          verificationStatus: request.verificationStatus,

          extractionVersion: request.extractionVersion,

          expiresAt: request.expiresAt,

          status: request.status,
        },
      );

      if (!updated) {
        return {
          success: false,

          error: new Error(
            `Memory "${request.memoryId}" not found for this profile.`,
          ),
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Memory update failed."),
      };
    }
  };

  /**
   * MEMORY_DELETE
   *
   * Soft-deletes a memory record scoped to profileId.
   */
  const deleteHandler = async (
    event: IpcMainInvokeEvent,
    request?: MemoryDeleteRequest,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    if (!request?.profileId?.trim()) {
      return {
        success: false,

        error: new Error("A profileId is required."),
      };
    }

    if (!request.memoryId?.trim()) {
      return {
        success: false,

        error: new Error("A memoryId is required."),
      };
    }

    try {
      const deleted = memoryRepository.softDelete(
        request.memoryId,

        request.profileId,
      );

      if (!deleted) {
        return {
          success: false,

          error: new Error(
            `Memory "${request.memoryId}" not found for this profile.`,
          ),
        };
      }

      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error ? error : new Error("Memory delete failed."),
      };
    }
  };

  /**
   * Register handlers.
   */
  ipcMain.handle(
    IPC_CHANNELS.MEMORY_SEARCH,
    searchHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_LIST,
    listHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_CREATE,
    createHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_UPDATE,
    updateHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.MEMORY_DELETE,
    deleteHandler,
  );

  /**
   * Cleanup.
   */
  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_SEARCH);

    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_LIST);

    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_CREATE);

    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_UPDATE);

    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_DELETE);
  };
}
