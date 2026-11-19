import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { IPC_CHANNELS } from "../../shared/constants/events";
import type { ProfileRepository } from "../../database/repositories/profileRepository";
import type { ActiveProfileService } from "../main/activeProfile";

export interface WorkspaceProfileSelectionRequest {
  readonly profileId: string;
}

export interface WorkspaceProfileCreateRequest {
  readonly displayName: string;
}

export interface WorkspaceProfileSummary {
  readonly id: string;
  readonly displayName: string;
}

export interface RegisterWorkspaceProfileIpcOptions {
  readonly repository: ProfileRepository;
  readonly activeProfileService: ActiveProfileService;
  readonly ipcMain: IpcMain;
}

interface IpcResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: Error;
}

function assertSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Workspace profile IPC sender is unavailable.");
  }
}

function requireRequest(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Workspace profile request must be an object.");
  }
  return value as Record<string, unknown>;
}

async function respond<T>(operation: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { success: true, data: await operation() };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error("Workspace profile operation failed."),
    };
  }
}

export function registerWorkspaceProfileIpc(
  options: RegisterWorkspaceProfileIpcOptions,
): () => void {
  const { repository, activeProfileService, ipcMain } = options;

  const list = (event: IpcMainInvokeEvent) =>
    respond(() => {
      assertSender(event);
      return {
        profiles: repository.list().map(
          (profile): WorkspaceProfileSummary => ({
            id: profile.id,
            displayName: profile.displayName,
          }),
        ),
        activeProfileId: activeProfileService.getActiveProfile(),
      };
    });

  const activate = (event: IpcMainInvokeEvent, request?: WorkspaceProfileSelectionRequest) =>
    respond(() => {
      assertSender(event);
      const profileId = requireRequest(request).profileId;
      if (typeof profileId !== "string" || !profileId.trim()) {
        throw new Error("Workspace profile ID is required.");
      }

      const profile = repository.getById(profileId.trim());
      if (!profile) {
        throw new Error("Workspace profile was not found.");
      }

      activeProfileService.setActiveProfile(profile.id);
      return { profileId: profile.id };
    });

  const create = (event: IpcMainInvokeEvent, request?: WorkspaceProfileCreateRequest) =>
    respond(() => {
      assertSender(event);
      const displayName = requireRequest(request).displayName;
      if (typeof displayName !== "string" || !displayName.trim()) {
        throw new Error("Workspace profile name is required.");
      }
      if (displayName.trim().length > 80) {
        throw new Error("Workspace profile name must be 80 characters or fewer.");
      }
      if (repository.list().length !== 0) {
        throw new Error("A workspace profile can only be created during initial setup.");
      }

      const profile = repository.create({ displayName: displayName.trim() });
      activeProfileService.setActiveProfile(profile.id);
      return { profileId: profile.id };
    });

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_PROFILE_LIST, list);
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_PROFILE_ACTIVATE, activate);
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_PROFILE_CREATE, create);

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_PROFILE_LIST);
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_PROFILE_ACTIVATE);
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_PROFILE_CREATE);
  };
}
