// ============================================================================
// FILE: core/documents/storage/DocumentStore.ts
// PURPOSE:
// Persistence contract for processed documents.
//
// Infrastructure implementations live outside core/documents.
// ============================================================================

import type { NormalizedDocument, ProcessedDocument } from "../DocumentTypes";

export interface DocumentStore {
  save(document: ProcessedDocument): Promise<void>;

  getById(documentId: string): Promise<ProcessedDocument | null>;

  delete(documentId: string): Promise<void>;

  exists(documentId: string): Promise<boolean>;

  updateStatus(
    documentId: string,
    status: ProcessedDocument["status"],
  ): Promise<void>;
}

export interface DocumentMetadataStore {
  saveMetadata(document: NormalizedDocument): Promise<void>;
}
