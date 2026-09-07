// core/documents/DocumentIndexer.ts

import type {
  ContextManager,
  IndexedDocument,
} from "../context/ContextManager";

import type { DocumentInput } from "../context/DocumentParser";

export interface DocumentIndexer {
  index(input: DocumentInput): Promise<IndexedDocument>;

  remove(documentId: string): Promise<void>;
}

export class ContextDocumentIndexer implements DocumentIndexer {
  public constructor(private readonly contextManager: ContextManager) {}

  public async index(input: DocumentInput): Promise<IndexedDocument> {
    return this.contextManager.indexDocument(input);
  }

  public async remove(documentId: string): Promise<void> {
    await this.contextManager.removeDocument(documentId);
  }
}