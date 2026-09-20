// ============================================================================
// FILE: core/documents/indexing/IndexMetadata.ts
// PURPOSE:
// Metadata attached to an indexable document/chunk.
// ============================================================================

export interface IndexMetadata {
  readonly documentId: string;

  readonly chunkId?: string;

  readonly documentType?: string;

  readonly documentName?: string;

  readonly mimeType?: string;

  readonly source?: string;

  readonly filename?: string;

  readonly pageNumber?: number;

  readonly sectionId?: string;

  readonly chunkIndex?: number;

  readonly startOffset?: number;

  readonly endOffset?: number;

  readonly createdAt?: string;

  readonly updatedAt?: string;

  readonly [key: string]: unknown;
}
