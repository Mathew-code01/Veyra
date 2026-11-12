import { afterEach, describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { createCandidateProfile } from "../../../core/candidate/contracts/CandidateTypes";
import { CandidateRepository } from "../../../database/repositories/candidateRepository";
import { CandidateEvidenceRepository } from "../../../database/repositories/candidateEvidenceRepository";
import { MemoryRepository } from "../../../database/repositories/memoryRepository";
import { registerCandidateIpc } from "../../../desktop/ipc/candidate.ipc";
import type { ActiveProfileResolver } from "../../../desktop/main/activeProfile";
import { IPC_CHANNELS } from "../../../shared/constants/events";
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

type Handler = (event: IpcMainInvokeEvent, request?: unknown) => Promise<unknown>;

describe("candidate IPC persistence integration", () => {
  let databasePath: string | undefined;

  afterEach(async () => {
    if (databasePath) {
      await destroyTestDatabase(databasePath);
      databasePath = undefined;
    }
  });

  it("persists candidate profiles and records only under the trusted active profile", async () => {
    databasePath = await createTestDatabase();
    const database = getTestDatabase().sqlite;
    database.prepare(
      `INSERT INTO profiles (id, display_name, preferences, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    ).run(
      "profile-one", "One", "{}", "2026-01-01", "2026-01-01",
      "profile-two", "Two", "{}", "2026-01-01", "2026-01-01",
    );

    let activeProfileId = "profile-one";
    const activeProfileResolver: ActiveProfileResolver = {
      getActiveProfile: () => activeProfileId,
      hasActiveProfile: () => activeProfileId !== undefined,
    };
    const repository = new CandidateRepository(() => activeProfileId);
    const evidenceRepository = new CandidateEvidenceRepository(() => activeProfileId);
    const memoryRepository = new MemoryRepository();
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn(),
    } as unknown as IpcMain;
    registerCandidateIpc({ repository, ipcMain, activeProfileResolver });

    const event = {
      sender: { isDestroyed: () => false },
    } as IpcMainInvokeEvent;
    const invoke = async (channel: string, request?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing candidate IPC handler: ${channel}`);
      return handler(event, request) as Promise<{
        readonly success: boolean;
        readonly data?: unknown;
      }>;
    };

    const profile = createCandidateProfile({
      id: "candidate-shared-id",
      fullName: "Candidate One",
      education: [],
      certifications: [],
    });
    expect(await invoke(IPC_CHANNELS.CANDIDATE_PROFILE_SAVE, { profile })).toMatchObject({
      success: true,
    });
    expect(await invoke(IPC_CHANNELS.CANDIDATE_PROFILE_LIST)).toMatchObject({
      success: true,
      data: [{ id: "candidate-shared-id", fullName: "Candidate One" }],
    });
    expect(await invoke(IPC_CHANNELS.CANDIDATE_RECORD_SAVE, {
      type: "experience",
      record: {
        id: "experience-one",
        candidateId: "candidate-shared-id",
        company: "Example",
        title: "Engineer",
        achievements: ["Improved reliability"],
        technologies: ["TypeScript"],
      },
    })).toMatchObject({ success: true });
    await evidenceRepository.save({
      id: "evidence-one",
      candidateId: "candidate-shared-id",
      type: "resume",
      text: "Profile-specific evidence",
      sourceId: "document-one",
      verified: false,
      confidence: 0.75,
      metadata: {},
    });
    memoryRepository.create({
      profileId: "profile-one",
      candidateId: "candidate-shared-id",
      category: "candidate",
      content: { value: "Candidate fact", text: "Profile-specific memory" },
      sourceType: "integration-test",
    });
    getTestDatabase().sqlite.prepare(
      `INSERT INTO context_vectors
       (id, context_id, text, vector, source_type, source_id, source_name,
        content_type, scope, metadata, embedding_model, dimensions, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "candidate-context-vector",
      "candidate-context",
      "Profile-scoped candidate context",
      "[1,0]",
      "document",
      "document-one",
      "resume.txt",
      "document",
      JSON.stringify({ profileId: "profile-one", candidateId: "candidate-shared-id" }),
      "{}",
      "test",
      2,
      "2026-01-01",
    );

    const rendererCannotChangeScope = await invoke(
      IPC_CHANNELS.CANDIDATE_PROFILE_LIST,
      { profileId: "profile-two" },
    );
    expect(rendererCannotChangeScope).toMatchObject({
      success: true,
      data: [{ id: "candidate-shared-id", fullName: "Candidate One" }],
    });

    activeProfileId = "profile-two";
    expect(await invoke(IPC_CHANNELS.CANDIDATE_PROFILE_LIST)).toMatchObject({
      success: true,
      data: [],
    });
    expect(await invoke(IPC_CHANNELS.CANDIDATE_RECORD_LIST, {
      candidateId: "candidate-shared-id",
      type: "experience",
    })).toMatchObject({ success: true, data: [] });
    expect(await evidenceRepository.list("candidate-shared-id")).toEqual([]);
    expect(memoryRepository.listByProfile("profile-two", {
      candidateId: "candidate-shared-id",
    })).toHaveLength(0);

    activeProfileId = "profile-one";
    expect(await invoke(IPC_CHANNELS.CANDIDATE_PROFILE_DELETE, {
      candidateId: "candidate-shared-id",
    })).toMatchObject({ success: true });
    expect(await invoke(IPC_CHANNELS.CANDIDATE_RECORD_LIST, {
      candidateId: "candidate-shared-id",
      type: "experience",
    })).toMatchObject({ success: true, data: [] });
    expect(await evidenceRepository.list("candidate-shared-id")).toEqual([]);
    expect(memoryRepository.listByProfile("profile-one", {
      candidateId: "candidate-shared-id",
    })).toEqual([]);
    expect(getTestDatabase().sqlite.prepare(
      "SELECT id FROM context_vectors WHERE id = ?",
    ).get("candidate-context-vector")).toBeUndefined();
  });
});
