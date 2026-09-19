// ============================================================================
// FILE: core/documents/DocumentMetadata.ts
// PURPOSE:
// Canonical metadata representation for processed documents.
// ============================================================================

export interface DocumentMetadata {
  readonly title?: string;

  readonly author?: string;

  readonly subject?: string;

  readonly description?: string;

  readonly language?: string;

  readonly keywords?: readonly string[];

  readonly createdAt?: string;

  readonly modifiedAt?: string;

  readonly pageCount?: number;

  readonly wordCount?: number;

  readonly characterCount?: number;

  readonly filename?: string;

  readonly extension?: string;

  readonly mimeType?: string;

  readonly fileSizeBytes?: number;

  readonly checksum?: string;

  /**
   * Allows parsers to preserve metadata that is specific
   * to a format without polluting the canonical contract.
   */
  readonly custom?: Readonly<Record<string, unknown>>;
}

/**
 * Safely creates a metadata object.
 */
export function createDocumentMetadata(
  metadata: DocumentMetadata = {},
): DocumentMetadata {
  return {
    ...metadata,
    keywords: metadata.keywords ? [...metadata.keywords] : undefined,
    custom: metadata.custom ? { ...metadata.custom } : undefined,
  };
}
