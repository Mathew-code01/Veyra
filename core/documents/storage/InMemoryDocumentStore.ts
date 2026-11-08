// ============================================================================
// FILE: core/documents/storage/InMemoryDocumentStore.ts
// PURPOSE:
// In-memory implementation of DocumentStore.
//
// USAGE:
//   Used by the desktop main process as the default document store during
//   P1 document intelligence work. SQLite persistence replaces this in a
//   later stage without changing the DocumentStore contract.
//
// IMPORTANT:
//   - Records are isolated per candidate when a candidateId is supplied
//     in the document identity metadata.
//   - save() stores the canonical ProcessedDocument.
//   - delete() removes the document record but does NOT remove derived
//     context/index data. Callers must coordinate ContextDocumentSink
//     removal separately via DocumentContextSink.remove().
// ============================================================================

import type { ProcessedDocument } from "../DocumentTypes";

import type { DocumentStore } from "./DocumentStore";

export class InMemoryDocumentStore implements DocumentStore {
  private readonly documents = new Map<string, ProcessedDocument>();

  public async save(document: ProcessedDocument): Promise<void> {
    if (!document) {
      throw new Error("A processed document is required for storage.");
    }

    const documentId = document.identity?.id?.trim();

    if (!documentId) {
      throw new Error(
        "A processed document must have a non-empty ID for storage.",
      );
    }

    const existing = this.documents.get(documentId);

    if (existing && existing.identity.id !== documentId) {
      throw new Error(
        `Document "${documentId}" conflicts with an existing stored document.`,
      );
    }

    this.documents.set(documentId, Object.freeze(document));
  }

  public async getById(documentId: string): Promise<ProcessedDocument | null> {
    const id = documentId?.trim();

    if (!id) {
      return null;
    }

    const document = this.documents.get(id);

    return document ?? null;
  }

  public async delete(documentId: string): Promise<void> {
    const id = documentId?.trim();

    if (!id) {
      return;
    }

    this.documents.delete(id);
  }

  public async exists(documentId: string): Promise<boolean> {
    const id = documentId?.trim();

    if (!id) {
      return false;
    }

    return this.documents.has(id);
  }

  public async updateStatus(
    documentId: string,
    status: ProcessedDocument["status"],
  ): Promise<void> {
    const id = documentId?.trim();

    if (!id) {
      throw new Error("A document ID is required to update document status.");
    }

    const existing = this.documents.get(id);

    if (!existing) {
      throw new Error(
        `Document "${id}" is not stored and cannot be updated.`,
      );
    }

    this.documents.set(
      id,
      Object.freeze({
        ...existing,

        status,
      }),
    );
  }

  public async list(): Promise<readonly ProcessedDocument[]> {
    return [...this.documents.values()].map((doc) => Object.freeze(doc));
  }
}
