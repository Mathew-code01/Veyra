import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ContextDocumentIndexer } from "../../../core/documents/ContextDocumentIndexer";
import { CandidateDocumentEvidenceAdapter } from "../../../core/candidate/services/CandidateDocumentEvidenceAdapter";
import {
  DefaultDocumentParserRegistry,
  DocumentService,
} from "../../../core/documents/DocumentService";
import { DocumentSourceType } from "../../../core/documents/DocumentTypes";
import { TextParser } from "../../../core/documents/parsers/TextParser";
import { SqliteDocumentStore } from "../../../core/documents/storage/SqliteDocumentStore";
import { createContextEngine } from "../../../core/context/createContextEngine";
import { CandidateEvidenceRepository } from "../../../database/repositories/candidateEvidenceRepository";
import { IPC_CHANNELS } from "../../../shared/constants/events";
import { registerDocumentIpc } from "../../../desktop/ipc/document.ipc";
import { ActiveProfileService } from "../../../desktop/main/activeProfile";
import {
  createTestDatabase,
  destroyTestDatabase,
  getTestDatabase,
} from "../../helpers/database";

describe("desktop document import integration", () => {
  it("reads a picker handle, parses bytes, persists the document, and scopes context", async () => {
    const databasePath = await createTestDatabase();
    const directory = await mkdtemp(join(tmpdir(), "veyra-doc-ipc-"));
    const filePath = join(directory, "resume.txt");
    const content = "Candidate worked with TypeScript and React.";
    await writeFile(filePath, content, "utf8");

    try {
      getTestDatabase().sqlite
        .prepare(
          `INSERT INTO profiles
            (id, display_name, preferences, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          "profile-test",
          "Integration profile",
          "{}",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
        );

      const activeProfile = new ActiveProfileService();
      activeProfile.setActiveProfile("profile-test");
      const contextEngine = createContextEngine();
      const evidenceStore = new CandidateEvidenceRepository(() =>
        activeProfile.getActiveProfile(),
      );
      const evidenceAdapter = new CandidateDocumentEvidenceAdapter({
        evidenceStore,
      });
      const documentService = new DocumentService({
        parserRegistry: new DefaultDocumentParserRegistry([new TextParser()]),
        documentStore: new SqliteDocumentStore({
          resolveProfileId: () => activeProfile.getActiveProfile(),
        }),
        resolveProfileId: () => activeProfile.getActiveProfile(),
        contextSink: new ContextDocumentIndexer(contextEngine.manager),
        aiAnalysis: {
          analyzer: {
            analyze: async (document) => ({
              analysisId: "analysis-test",
              documentId: document.identity.id,
              documentType: "resume",
              format: "txt",
              provider: "local",
              model: "test-analyzer",
              analyzedAt: "2026-01-01T00:00:00.000Z",
              summary: "The document records TypeScript and React experience.",
              facts: [
                {
                  category: "skill",
                  fact: "The candidate has TypeScript experience.",
                  confidence: 0.9,
                  sourceChunkIds: [document.chunks[0].id],
                },
              ],
              keywords: ["TypeScript", "React"],
              warnings: [],
            }),
          },
          options: { providerName: "local" },
          required: true,
        },
        candidateEvidence: { port: evidenceAdapter, required: true },
      });

      const handlers = new Map<string, (...args: any[]) => Promise<any>>();
      const ipcMain = {
        handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<any>) => {
          handlers.set(channel, handler);
        }),
        removeHandler: vi.fn(),
      };
      const dialog = {
        showOpenDialog: vi.fn(async () => ({
          canceled: false,
          filePaths: [filePath],
        })),
      };
      registerDocumentIpc({
        documentService,
        ipcMain: ipcMain as never,
        dialog,
      });
      const event = {
        sender: { id: 501, isDestroyed: () => false },
      };

      const picker = await handlers.get(IPC_CHANNELS.DOCUMENT_PICK)?.(event);
      expect(picker.success).toBe(true);
      expect(picker.data.files[0]).not.toHaveProperty("path");

      const imported = await handlers.get(IPC_CHANNELS.DOCUMENT_IMPORT)?.(
        event,
        {
          fileHandle: picker.data.files[0].handle,
          source: { type: DocumentSourceType.FILE },
          candidateId: "candidate-test",
        },
      );
      expect(imported.success).toBe(true);
      const documentId = imported.data.documentId as string;
      const stored = await documentService.getDocumentById(documentId);

      expect(stored?.text).toBe(content);
      expect(stored?.profileId).toBe("profile-test");
      expect(stored?.candidateId).toBe("candidate-test");
      expect(stored?.metadata.fileSizeBytes).toBe(Buffer.byteLength(content));
      expect(
        getTestDatabase().sqlite
          .prepare(
            "SELECT storage_path, size_bytes FROM documents WHERE id = ?",
          )
          .get(documentId),
      ).toEqual({
        storage_path: `sqlite-document://${encodeURIComponent(documentId)}`,
        size_bytes: Buffer.byteLength(content),
      });

      const scopedContext = await contextEngine.manager.query({
        query: "TypeScript React candidate experience",
        limit: 5,
        minScore: 0,
        scope: {
          profileId: "profile-test",
          candidateId: "candidate-test",
        },
      });
      expect(scopedContext.contexts.length).toBeGreaterThan(0);
      expect(scopedContext.contexts[0].source.id).toBe(documentId);
      await expect(evidenceStore.list("candidate-test")).resolves.toMatchObject([
        {
          candidateId: "candidate-test",
          sourceId: documentId,
          text: "The candidate has TypeScript experience.",
          verified: false,
        },
      ]);

      const otherProfileContext = await contextEngine.manager.query({
        query: "TypeScript React candidate experience",
        limit: 5,
        minScore: 0,
        scope: {
          profileId: "other-profile",
          candidateId: "candidate-test",
        },
      });
      expect(otherProfileContext.contexts).toEqual([]);

      await documentService.deleteDocument(documentId);
      await documentService.deleteDocument(documentId);
      expect(await documentService.getDocumentById(documentId)).toBeNull();
      await expect(evidenceStore.list("candidate-test")).resolves.toEqual([]);
      const contextAfterDelete = await contextEngine.manager.query({
        query: "TypeScript React candidate experience",
        limit: 5,
        minScore: 0,
        scope: {
          profileId: "profile-test",
          candidateId: "candidate-test",
        },
      });
      expect(contextAfterDelete.contexts).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
      await destroyTestDatabase(databasePath);
    }
  });
});
