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
//   - Every operation resolves its profile from trusted store configuration
//     or the active-profile resolver; document-supplied profile IDs are ignored.
//   - Missing profile scope fails closed for reads, writes, status changes,
//     and deletes.
//   - InMemoryDocumentStore remains available for tests/development but is
//     no longer the production default.
// ============================================================================

import type { ProcessedDocument } from "../DocumentTypes";
import type { DocumentStore } from "./DocumentStore";

import { DocumentRepository } from "../../../database/repositories/documentRepository";
import { documents } from "../../../database/schema";

export interface SqliteDocumentStoreOptions {
  readonly profileId?: string;

  /** Trusted main-process profile resolver used when no fixed scope is set. */
  readonly resolveProfileId?: () => string | undefined;
}

export class SqliteDocumentStore implements DocumentStore {
  private readonly repository: DocumentRepository;

  private readonly profileId?: string;

  private readonly resolveProfileId?: () => string | undefined;

  public constructor(options: SqliteDocumentStoreOptions = {}) {
    this.repository = new DocumentRepository();
    this.profileId = options.profileId;
    this.resolveProfileId = options.resolveProfileId;
  }

  private resolveScopeProfileId(): string | undefined {
    return this.profileId ?? this.resolveProfileId?.();
  }

  private requireScopeProfileId(): string {
    const profileId = this.resolveScopeProfileId()?.trim();
    if (!profileId) {
      throw new Error("An active profile is required for document access.");
    }
    return profileId;
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

    const profileId = this.requireScopeProfileId();

    const metadata = (document.metadata ?? {}) as Record<string, unknown>;

    const now = new Date().toISOString();
    const requestedStoragePath =
      typeof metadata.storagePath === "string"
        ? metadata.storagePath.trim()
        : "";
    const requestedSize =
      typeof metadata.fileSizeBytes === "number"
        ? metadata.fileSizeBytes
        : metadata.sizeBytes;
    const sizeBytes =
      typeof requestedSize === "number" &&
      Number.isFinite(requestedSize) &&
      requestedSize >= 0
        ? Math.floor(requestedSize)
        : 0;

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
        storagePath:
          requestedStoragePath ||
          `sqlite-document://${encodeURIComponent(documentId)}`,
        documentType: document.type,
        status: document.status as any,
        sizeBytes,
        extractedText: document.text,
        metadata: JSON.stringify({
          mimeType: metadata.mimeType,
          format: metadata.format,
          fileSizeBytes: sizeBytes,
          candidateId: document.candidateId,
          pageCount: metadata.pageCount,
          wordCount: metadata.wordCount,
          checksum: document.identity.checksum ?? metadata.checksum,
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

    const profileId = this.requireScopeProfileId();
    const row: any = this.repository.getById(id);

    if (!row || row.profileId !== profileId) {
      return null;
    }

    return this.toProcessedDocument(row);
  }

  public async delete(documentId: string): Promise<void> {
    const id = documentId?.trim();

    if (!id) {
      return;
    }

    const profileId = this.requireScopeProfileId();

    this.repository.deleteForProfile(id, profileId);
  }

  public async assertDeleteScope(documentId: string): Promise<void> {
    const profileId = this.requireScopeProfileId();

    const row = this.repository.getById(documentId.trim());
    if (row && row.profileId !== profileId) {
      throw new Error(
        "The document is not owned by the active profile and cannot be deleted.",
      );
    }
  }

  public async exists(documentId: string): Promise<boolean> {
    const id = documentId?.trim();

    if (!id) {
      return false;
    }

    const profileId = this.requireScopeProfileId();
    const row = this.repository.getById(id);

    if (!row || row.profileId !== profileId) {
      return false;
    }

    return true;
  }

  public async updateStatus(
    documentId: string,
    status: ProcessedDocument["status"],
  ): Promise<void> {
    const id = documentId?.trim();

    if (!id) {
      throw new Error("A document ID is required to update document status.");
    }

    const profileId = this.requireScopeProfileId();
    const row: any = this.repository.getById(id);

    if (!row || row.profileId !== profileId) {
      throw new Error(`Document "${id}" is not stored and cannot be updated.`);
    }

    this.repository.setStatusForProfile(id, status, profileId);
  }

  public async list(): Promise<readonly ProcessedDocument[]> {
    const profileId = this.requireScopeProfileId();
    const rows: any[] = this.repository.listByProfile(profileId);

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
      fileSizeBytes: metadata.fileSizeBytes ?? row.sizeBytes ?? 0,
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
      candidateId: metadata.candidateId,
    };
  }
}
