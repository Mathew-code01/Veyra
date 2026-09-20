// ============================================================================
// FILE: core/documents/indexing/IndexMetadata.ts
// PURPOSE:
// Metadata attached to an indexable document/chunk.
// ============================================================================

export interface IndexMetadata {
  /**
   * Canonical document identity.
   */
  readonly documentId: string;

  /**
   * Canonical chunk identity.
   */
  readonly chunkId?: string;

  /**
   * Canonical document type.
   */
  readonly documentType?: string;

  /**
   * Human-readable document name.
   */
  readonly documentName?: string;

  /**
   * Original MIME type.
   */
  readonly mimeType?: string;

  /**
   * Optional source identifier.
   */
  readonly source?: string;

  /**
   * Original filename.
   */
  readonly filename?: string;

  /**
   * Content checksum when available.
   */
  readonly checksum?: string;

  /**
   * Page provenance.
   */
  readonly pageNumber?: number;

  /**
   * Section provenance.
   */
  readonly sectionId?: string;

  /**
   * Position of the chunk in the document.
   */
  readonly chunkIndex?: number;

  /**
   * UTF-16 source offset.
   */
  readonly startOffset?: number;

  /**
   * UTF-16 exclusive source offset.
   */
  readonly endOffset?: number;

  /**
   * Original document creation timestamp.
   */
  readonly createdAt?: string;

  /**
   * Original document modification timestamp.
   */
  readonly updatedAt?: string;

  /**
   * Allows domain-specific metadata to flow through
   * without changing this interface for every new field.
   */
  readonly [key: string]: unknown;
}
