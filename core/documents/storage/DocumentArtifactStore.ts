// ============================================================================
// FILE: core/documents/storage/DocumentArtifactStore.ts
// PURPOSE:
// Storage contract for generated document-processing artifacts.
//
// Examples:
// - extracted text
// - normalized text
// - page information
// - chunk manifests
// - parser diagnostics
//
// This does not decide where the artifact is stored.
// ============================================================================

export type DocumentArtifactType =
  | "raw"
  | "extracted-text"
  | "normalized-text"
  | "structure"
  | "chunks"
  | "index-manifest"
  | "diagnostics";

export interface DocumentArtifact {
  readonly id: string;

  readonly documentId: string;

  readonly type: DocumentArtifactType;

  readonly content: Uint8Array | string;

  readonly contentType?: string;

  readonly sizeBytes: number;

  readonly createdAt: string;

  readonly checksum?: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DocumentArtifactStore {
  put(artifact: DocumentArtifact): Promise<void>;

  get(
    documentId: string,
    type: DocumentArtifactType,
  ): Promise<DocumentArtifact | null>;

  delete(documentId: string, type: DocumentArtifactType): Promise<void>;

  list(documentId: string): Promise<readonly DocumentArtifact[]>;

  exists(documentId: string, type: DocumentArtifactType): Promise<boolean>;
}
