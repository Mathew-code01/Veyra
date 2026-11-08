// ============================================================================
// FILE: core/documents/storage/SqliteDocumentStore.ts
//
// PURPOSE:
// Production SQLite-backed DocumentStore.
//
// Reuses the existing `DocumentRepository` (drizzle-orm + better-sqlite3)
// and the canonical `documents` table. Documents survive application
// shutdown and are scoped to profile_id for profile isolation.
//
// IMPORTANT:
//   - `save` requires `document.profileId` (set by DocumentService from the
//     import request's candidateId) or a store-level default profileId.
//   - Reads/deletes are scoped to the store's configured profileId when one
//     is supplied, enforcing profile isolation.
//   - InMemoryDocumentStore remains available for tests/development but is
//     no longer the production default.
// ============================================================================

import type { ProcessedDocument } from "../DocumentTypes";
import type { DocumentStore } from "./DocumentStore";

import { DocumentRepository } from "../../../database/repositories/documentRepository";
import { documents } from "../../../database/schema";

export interface SqliteDocumentStoreOptions {
  readonly profileId?: string;
}

export class SqliteDocumentStore implements DocumentStore {
  private readonly repository: DocumentRepository;

  private readonly profileId?: string;

  public constructor(options: SqliteDocumentStoreOptions = {}) {
    this.repository = new DocumentRepository();
    this.profileId = options.profileId;
  }

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

    const profileId = document.profileId ?? this.profileId;

    if (!profileId) {
      throw new Error(
        `Document "${documentId}" cannot be stored without a profileId.`,
      );
    }

    const metadata = (document.metadata ?? {}) as Record<string, unknown>;

    const now = new Date().toISOString();

    this.repository.create(
      // Values are mapped between the ProcessedDocument domain shape and the
      // drizzle documents schema (snake_case columns, camelShape properties).
      // Cast to `any` because DocumentProcessingStatus and DocumentStatus are
      // distinct enums and the two DocumentMetadata types diverge.
      {
        id: documentId,
        profileId,
        name: document.identity.filename ?? documentId,
        originalName: document.identity.filename ?? documentId,
        storagePath: metadata.storagePath ?? "",
        documentType: document.type,
        status: document.status as any,
        sizeBytes: Number(metadata.sizeBytes ?? 0),
        extractedText: document.text,
        metadata: JSON.stringify({
          mimeType: metadata.mimeType,
          format: metadata.format,
          pageCount: metadata.pageCount,
          wordCount: metadata.wordCount,
          checksum: document.identity.checksum,
          paragraphs: document.paragraphs,
          headings: document.headings,
          sections: document.sections,
          tables: document.tables,
          chunks: document.chunks,
          warnings: document.warnings,
        }),
        createdAt: now,
        updatedAt: now,
      } as any,
    );
  }

  public async getById(documentId: string): Promise<ProcessedDocument | null> {
    const id = documentId?.trim();

    if (!id) {
      return null;
    }

    const row: any = this.repository.getById(id);

    if (!row) {
      return null;
    }

    if (this.profileId && row.profileId !== this.profileId) {
      return null;
    }

    return this.toProcessedDocument(row);
  }

  public async delete(documentId: string): Promise<void> {
    const id = documentId?.trim();

    if (!id) {
      return;
    }

    this.repository.deleteForProfile(id, this.profileId ?? "");
  }

  public async exists(documentId: string): Promise<boolean> {
    const id = documentId?.trim();

    if (!id) {
      return false;
    }

    const row = this.repository.getById(id);

    if (!row) {
      return false;
    }

    return !this.profileId || row.profileId === this.profileId;
  }

  public async updateStatus(
    documentId: string,
    status: ProcessedDocument["status"],
  ): Promise<void> {
    const id = documentId?.trim();

    if (!id) {
      throw new Error("A document ID is required to update document status.");
    }

    const row: any = this.repository.getById(id);

    if (!row) {
      throw new Error(`Document "${id}" is not stored and cannot be updated.`);
    }

    if (this.profileId && row.profileId !== this.profileId) {
      throw new Error(
        `Document "${id}" is not visible to this profile and cannot be updated.`,
      );
    }

    this.repository.setStatus(id, status);
  }

  public async list(): Promise<readonly ProcessedDocument[]> {
    const profileId = this.profileId;

    const rows: any[] = profileId
      ? this.repository.listByProfile(profileId)
      : this.repository.listAll();

    return rows.map((row: any) => this.toProcessedDocument(row));
  }

  private toProcessedDocument(row: any): ProcessedDocument {
    let metadata: any = {};

    try {
      metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    } catch {
      metadata = {};
    }

    const chunks: readonly { readonly id: string; readonly documentId: string; readonly index: number; readonly text: string; readonly tokenEstimate?: number; readonly source: any; readonly metadata?: any }[] =
      Array.isArray(metadata.chunks) ? metadata.chunks : [];

    const storedMetadata: Record<string, unknown> = {
      mimeType: metadata.mimeType ?? "application/octet-stream",
      format: metadata.format ?? "unknown",
      sizeBytes: metadata.sizeBytes ?? row.sizeBytes ?? 0,
      pageCount: metadata.pageCount,
      wordCount: metadata.wordCount,
    };

    return {
      identity: {
        id: row.id,
        filename: row.originalName ?? row.name,
        checksum: metadata.checksum,
      },
      type: row.documentType,
      text: row.extractedText ?? "",
      metadata: storedMetadata as any,
      paragraphs: Array.isArray(metadata.paragraphs) ? metadata.paragraphs : [],
      headings: Array.isArray(metadata.headings) ? metadata.headings : [],
      sections: Array.isArray(metadata.sections) ? metadata.sections : [],
      tables: Array.isArray(metadata.tables) ? metadata.tables : [],
      chunks,
      status: row.status,
      processedAt: row.updatedAt,
      warnings: Array.isArray(metadata.warnings) ? metadata.warnings : [],
      profileId: row.profileId,
    };
  }
}
