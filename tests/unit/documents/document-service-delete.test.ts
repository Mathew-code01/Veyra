import { describe, expect, it, vi } from "vitest";

import {
  DefaultDocumentParserRegistry,
  DocumentService,
} from "../../../core/documents/DocumentService";
import type { DocumentStore } from "../../../core/documents/storage/DocumentStore";

describe("DocumentService.deleteDocument", () => {
  it("removes context and candidate evidence before deleting the stored document", async () => {
    const calls: string[] = [];
    const document = {
      identity: { id: "document-1" },
      profileId: "candidate-1",
    };
    const documentStore = {
      getById: vi.fn().mockResolvedValue(document),
      delete: vi.fn().mockImplementation(async () => {
        calls.push("document");
      }),
    } as unknown as DocumentStore;
    const contextSink = {
      index: vi.fn(),
      remove: vi.fn().mockImplementation(async () => {
        calls.push("context");
      }),
    };
    const candidateEvidencePort = {
      ingest: vi.fn(),
      removeDocument: vi.fn().mockImplementation(async () => {
        calls.push("evidence");
      }),
    };
    const service = new DocumentService({
      parserRegistry: new DefaultDocumentParserRegistry([]),
      documentStore,
      contextSink,
      candidateEvidence: { port: candidateEvidencePort },
    });

    await service.deleteDocument(" document-1 ");

    expect(contextSink.remove).toHaveBeenCalledWith("document-1");
    expect(candidateEvidencePort.removeDocument).toHaveBeenCalledWith(
      "document-1",
    );
    expect(documentStore.delete).toHaveBeenCalledWith("document-1");
    expect(calls).toEqual(["context", "evidence", "document"]);
  });

  it("does not delete derived data for a missing document", async () => {
    const documentStore = {
      getById: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    } as unknown as DocumentStore;
    const contextSink = { index: vi.fn(), remove: vi.fn() };
    const candidateEvidencePort = {
      ingest: vi.fn(),
      removeDocument: vi.fn(),
    };
    const service = new DocumentService({
      parserRegistry: new DefaultDocumentParserRegistry([]),
      documentStore,
      contextSink,
      candidateEvidence: { port: candidateEvidencePort },
    });

    await service.deleteDocument("missing");

    expect(contextSink.remove).not.toHaveBeenCalled();
    expect(candidateEvidencePort.removeDocument).not.toHaveBeenCalled();
    expect(documentStore.delete).not.toHaveBeenCalled();
  });

  it("checks storage ownership before removing derived data", async () => {
    const documentStore = {
      getById: vi.fn().mockResolvedValue({
        identity: { id: "document-1" },
        profileId: "candidate-1",
      }),
      assertDeleteScope: vi
        .fn()
        .mockRejectedValue(new Error("A profile scope is required.")),
      delete: vi.fn(),
    } as unknown as DocumentStore;
    const contextSink = { index: vi.fn(), remove: vi.fn() };
    const candidateEvidencePort = {
      ingest: vi.fn(),
      removeDocument: vi.fn(),
    };
    const service = new DocumentService({
      parserRegistry: new DefaultDocumentParserRegistry([]),
      documentStore,
      contextSink,
      candidateEvidence: { port: candidateEvidencePort },
    });

    await expect(service.deleteDocument("document-1")).rejects.toThrow(
      "A profile scope is required.",
    );
    expect(contextSink.remove).not.toHaveBeenCalled();
    expect(candidateEvidencePort.removeDocument).not.toHaveBeenCalled();
    expect(documentStore.delete).not.toHaveBeenCalled();
  });

  it("keeps the document row when derived cleanup fails and permits retry", async () => {
    const calls: string[] = [];
    const document = {
      identity: { id: "document-retry" },
      profileId: "profile-1",
    };
    const documentStore = {
      getById: vi.fn().mockResolvedValue(document),
      delete: vi.fn().mockImplementation(async () => calls.push("document")),
    } as unknown as DocumentStore;
    const contextSink = {
      index: vi.fn(),
      remove: vi.fn().mockImplementation(async () => calls.push("context")),
    };
    const removeDocument = vi
      .fn()
      .mockRejectedValueOnce(new Error("evidence database unavailable"))
      .mockImplementation(async () => calls.push("evidence"));
    const service = new DocumentService({
      parserRegistry: new DefaultDocumentParserRegistry([]),
      documentStore,
      contextSink,
      candidateEvidence: {
        port: { ingest: vi.fn(), removeDocument },
      },
    });

    await expect(service.deleteDocument("document-retry")).rejects.toThrow(
      "evidence database unavailable",
    );
    expect(documentStore.delete).not.toHaveBeenCalled();
    expect(calls).toEqual(["context"]);

    await service.deleteDocument("document-retry");
    expect(documentStore.delete).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["context", "context", "evidence", "document"]);
  });
});
