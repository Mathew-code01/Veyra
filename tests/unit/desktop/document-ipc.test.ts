import { describe, expect, it, vi, beforeEach } from "vitest";

import type { IpcMain } from "electron";

import { IPC_CHANNELS } from "../../../shared/constants/events";

import { registerDocumentIpc } from "../../../desktop/ipc/document.ipc";

import type { DocumentService } from "../../../core/documents/DocumentService";

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

function makeDialog() {
  return {
    showOpenDialog: vi.fn(),
  };
}

function handlerMap(ipcMain: IpcMain): Map<string, unknown> {
  const map = new Map<string, unknown>();

  const handle = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

  for (const call of handle.mock.calls) {
    map.set(call[0], call[1]);
  }

  return map;
}

function makeDocumentService(): DocumentService {
  return {
    process: vi.fn(),
    getDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    listDocuments: vi.fn(),
  } as unknown as DocumentService;
}

describe("registerDocumentIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers document pick, import, read, delete, and list handlers", () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handlers = handlerMap(ipcMain);

    expect(handlers.has(IPC_CHANNELS.DOCUMENT_PICK)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.DOCUMENT_IMPORT)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.DOCUMENT_READ)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.DOCUMENT_DELETE)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.DOCUMENT_LIST)).toBe(true);
  });

  it("document:pick returns selected file paths", async () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/cv.pdf"],
    });

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_PICK,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filePaths).toEqual(["/tmp/cv.pdf"]);
    }

    expect(dialog.showOpenDialog).toHaveBeenCalledTimes(1);
  });

  it("document:pick returns empty when canceled", async () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    dialog.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_PICK,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filePaths).toEqual([]);
    }
  });

  it("document:import runs the ingestion pipeline", async () => {
    const process = vi.fn().mockResolvedValue({
      document: {
        identity: { id: "doc-1", filename: "cv.pdf" },
        type: "pdf",
        text: "Extracted text.",
        metadata: {},
        paragraphs: [],
        headings: [],
        sections: [],
        tables: [],
        chunks: [],
        status: "completed",
        processedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
      indexBatch: { documentId: "doc-1", documents: [], createdAt: "t" },
      validation: { valid: true, warnings: [] },
      classification: {
        type: "pdf",
        confidence: 1,
        source: "mime",
        warnings: [],
      },
      analysis: {
        analysisId: "analysis-1",
        documentId: "doc-1",
        documentType: "resume",
        format: "pdf",
        provider: "local",
        model: "local-model",
        analyzedAt: "2026-01-01T00:00:00.000Z",
        summary: "A CV.",
        facts: [],
        keywords: [],
        warnings: [],
      },
    } as never);

    const documentService = { process } as unknown as DocumentService;
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_IMPORT,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        source: {
          type: "file",
          path: "/tmp/cv.pdf",
          filename: "cv.pdf",
          mimeType: "application/pdf",
          data: new Uint8Array([1, 2, 3]),
        },
        candidateId: "cand-1",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.documentId).toBe("doc-1");
      expect(result.data.analysis?.analysisId).toBe("analysis-1");
    }

    expect(process).toHaveBeenCalledTimes(1);
    const callArg = process.mock.calls[0][0];
    expect(callArg.candidateId).toBe("cand-1");
  });

  it("document:import returns failure when no request is supplied", async () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_IMPORT,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(false);
  });

  it("document:import returns failure when the pipeline throws", async () => {
    const process = vi.fn().mockRejectedValue(new Error("parse failed"));

    const documentService = { process } as unknown as DocumentService;
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_IMPORT,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      {
        source: {
          type: "file",
          path: "/tmp/cv.pdf",
          filename: "cv.pdf",
          mimeType: "application/pdf",
          data: new Uint8Array([1]),
        },
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error as Error).message).toBe("parse failed");
    }
  });

  it("document:read returns the stored document", async () => {
    const getDocumentById = vi.fn().mockResolvedValue({
      identity: { id: "doc-1", filename: "cv.pdf" },
      type: "pdf",
      text: "Content.",
      metadata: {},
      paragraphs: [],
      headings: [],
      sections: [],
      tables: [],
      chunks: [],
      status: "completed",
      processedAt: "t",
      warnings: [],
    } as never);

    const documentService = { getDocumentById } as unknown as DocumentService;
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_READ,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      { documentId: "doc-1" },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.identity.id).toBe("doc-1");
    }
  });

  it("document:read returns failure when document is not found", async () => {
    const getDocumentById = vi.fn().mockResolvedValue(null);

    const documentService = { getDocumentById } as unknown as DocumentService;
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_READ,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      { documentId: "missing" },
    );

    expect(result.success).toBe(false);
  });

  it("document:read returns failure when no documentId is supplied", async () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_READ,
    ) as (event: unknown, request?: unknown) => unknown;

    const outcome = await handler({ sender: makeSender() }, undefined);

    expect(outcome.success).toBe(false);
  });

  it("document:delete removes a stored document", async () => {
    const deleteDocument = vi.fn().mockResolvedValue(undefined);

    const documentService = { deleteDocument } as unknown as DocumentService;
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_DELETE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },
      { documentId: "doc-1" },
    );

    expect(result.success).toBe(true);
    expect(deleteDocument).toHaveBeenCalledWith("doc-1");
  });

  it("document:list returns stored documents", async () => {
    const listDocuments = vi.fn().mockResolvedValue([
      {
        identity: { id: "doc-1", filename: "cv.pdf" },
        type: "pdf",
        text: "",
        metadata: {},
        paragraphs: [],
        headings: [],
        sections: [],
        tables: [],
        chunks: [],
        status: "completed",
        processedAt: "t",
        warnings: [],
      },
    ] as never);

    const documentService = { listDocuments } as unknown as DocumentService;
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_LIST,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].documentId).toBe("doc-1");
    }
  });

  it("handlers reject when the IPC sender is destroyed", async () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    registerDocumentIpc({ documentService, ipcMain, dialog });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.DOCUMENT_READ,
    ) as (event: unknown, request?: unknown) => unknown;

    await expect(
      handler({ sender: makeSender(true) }, { documentId: "doc-1" }),
    ).rejects.toThrow(/sender is no longer available/);
  });

  it("cleanup removes the registered handlers", () => {
    const documentService = makeDocumentService();
    const ipcMain = makeIpcMain();
    const dialog = makeDialog();

    const cleanup = registerDocumentIpc({
      documentService,
      ipcMain,
      dialog,
    });

    cleanup();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.DOCUMENT_PICK);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.DOCUMENT_IMPORT);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.DOCUMENT_READ);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.DOCUMENT_DELETE);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.DOCUMENT_LIST);
  });
});
