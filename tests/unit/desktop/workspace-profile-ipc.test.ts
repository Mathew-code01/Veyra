import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMain } from "electron";

import type {
  Profile,
  ProfileRepository,
} from "../../../database/repositories/profileRepository";
import { registerWorkspaceProfileIpc } from "../../../desktop/ipc/workspace-profile.ipc";
import { ActiveProfileService } from "../../../desktop/main/activeProfile";
import { IPC_CHANNELS } from "../../../shared/constants/events";

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

function makeEvent(isDestroyed = false) {
  return { sender: { isDestroyed: () => isDestroyed } };
}

function makeProfile(id: string, displayName: string): Profile {
  return {
    id,
    displayName,
    email: null,
    headline: null,
    summary: null,
    location: null,
    phone: null,
    linkedinUrl: null,
    githubUrl: null,
    websiteUrl: null,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRepository(initial: readonly Profile[] = []) {
  let profiles = [...initial];
  const repository = {
    list: vi.fn(() => profiles),
    getById: vi.fn((id: string) => profiles.find((profile) => profile.id === id)),
    create: vi.fn((input: { readonly displayName: string }) => {
      const profile = makeProfile("created-profile", input.displayName);
      profiles = [...profiles, profile];
      return profile;
    }),
  };
  return repository as unknown as ProfileRepository;
}

describe("registerWorkspaceProfileIpc", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only profile summaries and reports the active profile", async () => {
    const ipcMain = makeIpcMain();
    const repository = makeRepository([makeProfile("profile-1", "Personal")]);
    const activeProfileService = new ActiveProfileService();
    activeProfileService.setActiveProfile("profile-1");
    registerWorkspaceProfileIpc({
      repository,
      activeProfileService,
      ipcMain,
    });

    const result = await getHandlers(ipcMain).get(IPC_CHANNELS.WORKSPACE_PROFILE_LIST)?.(
      makeEvent(),
    ) as { success: boolean; data?: unknown };

    expect(result).toEqual({
      success: true,
      data: {
        profiles: [{ id: "profile-1", displayName: "Personal" }],
        activeProfileId: "profile-1",
      },
    });
  });

  it("activates only an existing workspace profile", async () => {
    const ipcMain = makeIpcMain();
    const repository = makeRepository([makeProfile("profile-1", "Personal")]);
    const activeProfileService = new ActiveProfileService();
    registerWorkspaceProfileIpc({
      repository,
      activeProfileService,
      ipcMain,
    });
    const handlers = getHandlers(ipcMain);

    const activated = await handlers.get(IPC_CHANNELS.WORKSPACE_PROFILE_ACTIVATE)?.(
      makeEvent(),
      { profileId: "profile-1" },
    ) as { success: boolean; data?: unknown };
    const rejected = await handlers.get(IPC_CHANNELS.WORKSPACE_PROFILE_ACTIVATE)?.(
      makeEvent(),
      { profileId: "unknown" },
    ) as { success: boolean };

    expect(activated).toMatchObject({ success: true, data: { profileId: "profile-1" } });
    expect(rejected.success).toBe(false);
    expect(activeProfileService.getActiveProfile()).toBe("profile-1");
  });

  it("creates and activates a workspace only when none exists", async () => {
    const ipcMain = makeIpcMain();
    const repository = makeRepository();
    const activeProfileService = new ActiveProfileService();
    const cleanup = registerWorkspaceProfileIpc({
      repository,
      activeProfileService,
      ipcMain,
    });
    const handlers = getHandlers(ipcMain);

    const created = await handlers.get(IPC_CHANNELS.WORKSPACE_PROFILE_CREATE)?.(
      makeEvent(),
      { displayName: "  Personal  " },
    ) as { success: boolean; data?: unknown };
    const duplicate = await handlers.get(IPC_CHANNELS.WORKSPACE_PROFILE_CREATE)?.(
      makeEvent(),
      { displayName: "Second" },
    ) as { success: boolean };

    expect(created).toMatchObject({ success: true, data: { profileId: "created-profile" } });
    expect(repository.create).toHaveBeenCalledWith({ displayName: "Personal" });
    expect(activeProfileService.getActiveProfile()).toBe("created-profile");
    expect(duplicate.success).toBe(false);
    cleanup();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed or destroyed-sender requests", async () => {
    const ipcMain = makeIpcMain();
    const repository = makeRepository();
    registerWorkspaceProfileIpc({
      repository,
      activeProfileService: new ActiveProfileService(),
      ipcMain,
    });
    const handler = getHandlers(ipcMain).get(IPC_CHANNELS.WORKSPACE_PROFILE_CREATE);

    const malformed = await handler?.(makeEvent(), { displayName: " " }) as { success: boolean };
    const destroyed = await handler?.(makeEvent(true), { displayName: "Personal" }) as { success: boolean };

    expect(malformed.success).toBe(false);
    expect(destroyed.success).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
  });
});
