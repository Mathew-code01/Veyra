import { describe, expect, it, vi, beforeEach } from "vitest";

import { IPC_CHANNELS } from "../../../shared/constants/events";

import { registerMemoryIpc } from "../../../desktop/ipc/memory.ipc";

import type { IpcMain } from "electron";

import type { MemoryRepository } from "../../../database/repositories/memoryRepository";

function makeSender(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
  };
}

function makeIpcMain(): IpcMain {
  return {
    handle: vi.fn(),

    removeHandler: vi.fn(),
  } as unknown as IpcMain;
}

function handlerMap(ipcMain: IpcMain): Map<string, unknown> {
  const map = new Map<string, unknown>();

  const handle = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

  for (const call of handle.mock.calls) {
    map.set(call[0], call[1]);
  }

  return map;
}

function makeRepository(): MemoryRepository {
  return {
    create: vi.fn(),

    getById: vi.fn(),

    listByProfile: vi.fn(),

    search: vi.fn(),

    update: vi.fn(),

    softDelete: vi.fn(),

    hardDelete: vi.fn(),

    expireOlderThan: vi.fn(),

    countByProfile: vi.fn(),
  } as unknown as MemoryRepository;
}

describe("registerMemoryIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers memory search, list, create, update, and delete handlers", () => {
    const repository = makeRepository();

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handlers = handlerMap(ipcMain);

    expect(handlers.has(IPC_CHANNELS.MEMORY_SEARCH)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.MEMORY_LIST)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.MEMORY_CREATE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.MEMORY_UPDATE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.MEMORY_DELETE)).toBe(true);
  });

  it("memory:search returns records scoped to profile", async () => {
    const repository = makeRepository();

    const search = vi.fn().mockReturnValue([{ id: "mem-1" }]);

    repository.search = search;

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_SEARCH,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      {
        profileId: "profile-1",

        query: "React",

        limit: 5,
      },
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toHaveLength(1);
    }

    expect(search).toHaveBeenCalledWith("profile-1", {
      query: "React",

      limit: 5,
    });
  });

  it("memory:search rejects when no profileId is supplied", async () => {
    const repository = makeRepository();

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_SEARCH,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { query: "React" },
    );

    expect(result.success).toBe(false);
    expect(repository.search).not.toHaveBeenCalled();
  });

  it("memory:list returns records for a profile", async () => {
    const repository = makeRepository();

    const listByProfile = vi.fn().mockReturnValue([{ id: "mem-1" }]);

    repository.listByProfile = listByProfile;

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_LIST,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { profileId: "profile-1", category: "preference" },
    );

    expect(result.success).toBe(true);

    expect(listByProfile).toHaveBeenCalledWith("profile-1", {
      category: "preference",

      limit: undefined,
    });
  });

  it("memory:create returns the new memory id", async () => {
    const repository = makeRepository();

    const create = vi.fn().mockReturnValue({ id: "mem-new" });

    repository.create = create;

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_CREATE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      {
        profileId: "profile-1",

        category: "candidate",

        content: { text: "knows TypeScript" },

        sourceType: "document",

        confidence: 90,
      },
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.memoryId).toBe("mem-new");
    }

    expect(create).toHaveBeenCalledWith({
      profileId: "profile-1",

      category: "candidate",

      content: { text: "knows TypeScript" },

      sourceType: "document",

      sourceId: undefined,

      sourceName: undefined,

      confidence: 90,

      verificationStatus: undefined,

      extractionVersion: undefined,

      expiresAt: undefined,
    });
  });

  it("memory:create rejects when category is missing", async () => {
    const repository = makeRepository();

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_CREATE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { profileId: "profile-1", content: { text: "x" } },
    );

    expect(result.success).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("memory:update returns false when record not found for profile", async () => {
    const repository = makeRepository();

    const update = vi.fn().mockReturnValue(null);

    repository.update = update;

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_UPDATE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { profileId: "profile-1", memoryId: "mem-missing" },
    );

    expect(result.success).toBe(false);
  });

  it("memory:delete soft-deletes a record", async () => {
    const repository = makeRepository();

    const softDelete = vi.fn().mockReturnValue(true);

    repository.softDelete = softDelete;

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_DELETE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { profileId: "profile-1", memoryId: "mem-1" },
    );

    expect(result.success).toBe(true);
    expect(softDelete).toHaveBeenCalledWith("mem-1", "profile-1");
  });

  it("memory:delete returns false when record not found", async () => {
    const repository = makeRepository();

    const softDelete = vi.fn().mockReturnValue(false);

    repository.softDelete = softDelete;

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_DELETE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { profileId: "profile-1", memoryId: "mem-missing" },
    );

    expect(result.success).toBe(false);
  });

  it("handlers reject when the IPC sender is destroyed", async () => {
    const repository = makeRepository();

    const ipcMain = makeIpcMain();

    registerMemoryIpc({ memoryRepository: repository, ipcMain });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.MEMORY_SEARCH,
    ) as (event: unknown, request?: unknown) => unknown;

    await expect(
      handler({ sender: makeSender(true) }, { profileId: "profile-1" }),
    ).rejects.toThrow(/sender is no longer available/);
  });

  it("cleanup removes the registered handlers", () => {
    const repository = makeRepository();

    const ipcMain = makeIpcMain();

    const cleanup = registerMemoryIpc({ memoryRepository: repository, ipcMain });

    cleanup();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.MEMORY_SEARCH);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.MEMORY_LIST);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.MEMORY_CREATE);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.MEMORY_UPDATE);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.MEMORY_DELETE);
  });
});
