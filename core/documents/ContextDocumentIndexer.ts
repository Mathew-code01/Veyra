// ============================================================================
// FILE: core/documents/ContextDocumentIndexer.ts
// PURPOSE:
// Adapts the document subsystem to the ContextManager.
//
// RESPONSIBILITY:
// DocumentInput -> IndexedDocument
//
// This is intentionally separate from indexing/DocumentIndexer.ts,
// which prepares index-neutral IndexBatch records.
// ============================================================================

import type {
  ContextManager,
  IndexedDocument,
} from "../context/ContextManager";

import type { DocumentInput } from "../context/DocumentParser";

export interface ContextDocumentIndexPort {
  index(input: DocumentInput): Promise<IndexedDocument>;

  remove(documentId: string): Promise<void>;
}

export class ContextDocumentIndexer implements ContextDocumentIndexPort {
  public constructor(private readonly contextManager: ContextManager) {}

  public async index(input: DocumentInput): Promise<IndexedDocument> {
    return this.contextManager.indexDocument(input);
  }

  public async remove(documentId: string): Promise<void> {
    await this.contextManager.removeDocument(documentId);
  }
}
