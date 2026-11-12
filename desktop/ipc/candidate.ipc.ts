import type { IpcMain, IpcMainInvokeEvent } from "electron";

import type {
  CandidateExperience,
  CandidateProfile,
  CandidateProject,
  CandidateSkill,
  CandidateStory,
} from "../../core/candidate/contracts/CandidateTypes";
import { CandidateValidator } from "../../core/candidate/validation/CandidateValidator";
import type { CandidateRepository } from "../../database/repositories/candidateRepository";
import { IPC_CHANNELS } from "../../shared/constants/events";
import type { ActiveProfileResolver } from "../main/activeProfile";

export type CandidateRecordType = "experience" | "project" | "skill" | "story";

export interface CandidateProfileRequest {
  readonly candidateId: string;
}

export interface CandidateProfileSaveRequest {
  readonly profile: CandidateProfile;
}

export interface CandidateRecordRequest {
  readonly candidateId: string;
  readonly type: CandidateRecordType;
  readonly recordId?: string;
}

export interface CandidateRecordSaveRequest {
  readonly type: CandidateRecordType;
  readonly record:
    | CandidateExperience
    | CandidateProject
    | CandidateSkill
    | CandidateStory;
}

export interface RegisterCandidateIpcOptions {
  readonly repository: CandidateRepository;
  readonly validator?: CandidateValidator;
  readonly activeProfileResolver: ActiveProfileResolver;
  readonly ipcMain: IpcMain;
}

interface IpcResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: Error;
}

function assertSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Candidate IPC sender is unavailable.");
  }
}

function requireRequest(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Candidate request must be an object.");
  }
  return value as Record<string, unknown>;
}

function requireActiveProfile(resolver: ActiveProfileResolver): void {
  if (!resolver.getActiveProfile()) {
    throw new Error("No active profile is selected.");
  }
}

async function respond<T>(operation: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { success: true, data: await operation() };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error("Candidate operation failed."),
    };
  }
}

export function registerCandidateIpc(options: RegisterCandidateIpcOptions): () => void {
  const { repository, ipcMain, activeProfileResolver } = options;
  const validator: CandidateValidator = options.validator ?? new CandidateValidator();

  const getProfile = (event: IpcMainInvokeEvent, request?: CandidateProfileRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const candidateId = requireRequest(request).candidateId;
      validator.validateCandidateId(candidateId);
      return repository.profileStore.get(candidateId);
    });

  const listProfiles = (event: IpcMainInvokeEvent) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      return repository.listProfiles();
    });

  const saveProfile = (event: IpcMainInvokeEvent, request?: CandidateProfileSaveRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const profile = requireRequest(request).profile;
      validator.validateProfile(profile);
      await repository.profileStore.save(profile);
      return { candidateId: profile.id };
    });

  const deleteProfile = (event: IpcMainInvokeEvent, request?: CandidateProfileRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const candidateId = requireRequest(request).candidateId;
      validator.validateCandidateId(candidateId);
      await repository.profileStore.remove(candidateId);
      return { deleted: true };
    });

  const listRecords = (event: IpcMainInvokeEvent, request?: CandidateRecordRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const input = requireRequest(request);
      const candidateId = input.candidateId;
      validator.validateCandidateId(candidateId);
      switch (input.type) {
        case "experience": return repository.experienceStore.list(candidateId);
        case "project": return repository.projectStore.list(candidateId);
        case "skill": return repository.skillStore.list(candidateId);
        case "story": return repository.storyStore.list(candidateId);
        default: throw new Error("Candidate record type is invalid.");
      }
    });

  const getRecord = (event: IpcMainInvokeEvent, request?: CandidateRecordRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const input = requireRequest(request);
      const candidateId = input.candidateId;
      const recordId = input.recordId;
      validator.validateCandidateId(candidateId);
      if (typeof recordId !== "string" || !recordId.trim()) {
        throw new Error("Candidate record ID is required.");
      }
      switch (input.type) {
        case "experience": return repository.experienceStore.get(candidateId, recordId);
        case "project": return repository.projectStore.get(candidateId, recordId);
        case "skill": return repository.skillStore.get(candidateId, recordId);
        case "story": return repository.storyStore.get(candidateId, recordId);
        default: throw new Error("Candidate record type is invalid.");
      }
    });

  const saveRecord = (event: IpcMainInvokeEvent, request?: CandidateRecordSaveRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const input = requireRequest(request);
      const record = input.record;
      switch (input.type) {
        case "experience":
          validator.validateExperience(record);
          await repository.experienceStore.save(record);
          break;
        case "project":
          validator.validateProject(record);
          await repository.projectStore.save(record);
          break;
        case "skill":
          validator.validateSkill(record);
          await repository.skillStore.save(record);
          break;
        case "story":
          validator.validateStory(record);
          await repository.storyStore.save(record);
          break;
        default: throw new Error("Candidate record type is invalid.");
      }
      return { saved: true };
    });

  const deleteRecord = (event: IpcMainInvokeEvent, request?: CandidateRecordRequest) =>
    respond(async () => {
      assertSender(event);
      requireActiveProfile(activeProfileResolver);
      const input = requireRequest(request);
      const candidateId = input.candidateId;
      const recordId = input.recordId;
      validator.validateCandidateId(candidateId);
      if (typeof recordId !== "string" || !recordId.trim()) {
        throw new Error("Candidate record ID is required.");
      }
      switch (input.type) {
        case "experience": await repository.experienceStore.remove(candidateId, recordId); break;
        case "project": await repository.projectStore.remove(candidateId, recordId); break;
        case "skill": await repository.skillStore.remove(candidateId, recordId); break;
        case "story": await repository.storyStore.remove(candidateId, recordId); break;
        default: throw new Error("Candidate record type is invalid.");
      }
      return { deleted: true };
    });

  ipcMain.handle(IPC_CHANNELS.CANDIDATE_PROFILE_GET, getProfile);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_PROFILE_LIST, listProfiles);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_PROFILE_SAVE, saveProfile);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_PROFILE_DELETE, deleteProfile);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_RECORD_LIST, listRecords);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_RECORD_GET, getRecord);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_RECORD_SAVE, saveRecord);
  ipcMain.handle(IPC_CHANNELS.CANDIDATE_RECORD_DELETE, deleteRecord);

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_PROFILE_GET);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_PROFILE_LIST);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_PROFILE_SAVE);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_PROFILE_DELETE);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_RECORD_LIST);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_RECORD_GET);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_RECORD_SAVE);
    ipcMain.removeHandler(IPC_CHANNELS.CANDIDATE_RECORD_DELETE);
  };
}
