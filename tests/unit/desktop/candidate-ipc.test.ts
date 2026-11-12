import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";

import { IPC_CHANNELS } from "../../../shared/constants/events";
import { registerCandidateIpc } from "../../../desktop/ipc/candidate.ipc";
import type { CandidateRepository } from "../../../database/repositories/candidateRepository";
import type { ActiveProfileResolver } from "../../../desktop/main/activeProfile";

type Handler = (event: unknown, request?: unknown) => Promise<unknown>;

function makeIpcMain(): IpcMain {
  return {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  } as unknown as IpcMain;
}

function getHandlers(ipcMain: IpcMain): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const handle = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;
  for (const [channel, handler] of handle.mock.calls) {
    handlers.set(channel, handler as Handler);
  }
  return handlers;
}

function makeRepository() {
  const listExperience = vi.fn().mockResolvedValue([]);
  const repository = {
    profileStore: { get: vi.fn(), save: vi.fn(), remove: vi.fn() },
    listProfiles: vi.fn().mockResolvedValue([]),
    experienceStore: { list: listExperience, get: vi.fn(), save: vi.fn(), remove: vi.fn() },
    projectStore: { list: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn() },
    skillStore: { list: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn() },
    storyStore: { list: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn() },
  } as unknown as CandidateRepository;
  return { repository, listExperience };
}

function makeEvent() {
  return { sender: { isDestroyed: () => false } };
}

describe("registerCandidateIpc", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers candidate CRUD channels and removes them on cleanup", () => {
    const ipcMain = makeIpcMain();
    const { repository } = makeRepository();
    const cleanup = registerCandidateIpc({
      repository,
      ipcMain,
      activeProfileResolver: { getActiveProfile: () => "active", hasActiveProfile: () => true },
    });

    expect(getHandlers(ipcMain).size).toBe(8);
    cleanup();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(8);
  });

  it("fails closed without an active profile", async () => {
    const ipcMain = makeIpcMain();
    const { repository } = makeRepository();
    registerCandidateIpc({
      repository,
      ipcMain,
      activeProfileResolver: { getActiveProfile: () => undefined, hasActiveProfile: () => false },
    });

    const result = await getHandlers(ipcMain).get(IPC_CHANNELS.CANDIDATE_PROFILE_GET)?.(
      makeEvent(),
      { candidateId: "candidate-1" },
    ) as { success: boolean };
    expect(result.success).toBe(false);
    expect(repository.profileStore.get).not.toHaveBeenCalled();
  });

  it("does not accept a renderer-supplied profile ID as scope", async () => {
    const ipcMain = makeIpcMain();
    const { repository, listExperience } = makeRepository();
    const resolver: ActiveProfileResolver = {
      getActiveProfile: () => "trusted-profile",
      hasActiveProfile: () => true,
    };
    registerCandidateIpc({ repository, ipcMain, activeProfileResolver: resolver });

    const result = await getHandlers(ipcMain).get(IPC_CHANNELS.CANDIDATE_RECORD_LIST)?.(
      makeEvent(),
      { type: "experience", candidateId: "candidate-1", profileId: "attacker-profile" },
    ) as { success: boolean };
    expect(result.success).toBe(true);
    expect(listExperience).toHaveBeenCalledWith("candidate-1");
    expect(resolver.getActiveProfile()).toBe("trusted-profile");
  });

  it("fails closed when listing profiles without an active profile", async () => {
    const ipcMain = makeIpcMain();
    const { repository } = makeRepository();
    registerCandidateIpc({
      repository,
      ipcMain,
      activeProfileResolver: { getActiveProfile: () => undefined, hasActiveProfile: () => false },
    });

    const result = await getHandlers(ipcMain).get(IPC_CHANNELS.CANDIDATE_PROFILE_LIST)?.(
      makeEvent(),
    ) as { success: boolean };
    expect(result.success).toBe(false);
    expect(repository.listProfiles).not.toHaveBeenCalled();
  });

  it("rejects malformed candidate records before repository writes", async () => {
    const ipcMain = makeIpcMain();
    const { repository } = makeRepository();
    registerCandidateIpc({
      repository,
      ipcMain,
      activeProfileResolver: { getActiveProfile: () => "active", hasActiveProfile: () => true },
    });

    const result = await getHandlers(ipcMain).get(IPC_CHANNELS.CANDIDATE_RECORD_SAVE)?.(
      makeEvent(),
      { type: "experience", record: { id: "incomplete" } },
    ) as { success: boolean };
    expect(result.success).toBe(false);
    expect(repository.experienceStore.save).not.toHaveBeenCalled();
  });
});
