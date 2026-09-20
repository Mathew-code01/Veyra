// ============================================================================
// FILE: core/documents/DocumentMetadata.ts
// PURPOSE:
// Canonical metadata representation for processed documents.
//
// IMPORTANT:
// This is format-neutral metadata.
// Parsers may preserve format-specific values inside `custom`.
// ============================================================================

export interface DocumentMetadata {
  /**
   * Canonical document title.
   */
  readonly title?: string;

  /**
   * Document author if available.
   */
  readonly author?: string;

  /**
   * Document subject.
   */
  readonly subject?: string;

  /**
   * Human-readable document description.
   */
  readonly description?: string;

  /**
   * BCP-47 language tag when known.
   *
   * Examples:
   *   en
   *   en-US
   *   fr
   *   pt-BR
   */
  readonly language?: string;

  /**
   * Document keywords.
   */
  readonly keywords?: readonly string[];

  /**
   * Original document creation timestamp.
   */
  readonly createdAt?: string;

  /**
   * Original document modification timestamp.
   */
  readonly modifiedAt?: string;

  /**
   * Number of pages when applicable.
   */
  readonly pageCount?: number;

  /**
   * Number of words in normalized text.
   */
  readonly wordCount?: number;

  /**
   * Number of UTF-16 characters in normalized text.
   */
  readonly characterCount?: number;

  /**
   * Original filename.
   */
  readonly filename?: string;

  /**
   * Normalized extension.
   *
   * Example:
   *   ".pdf"
   */
  readonly extension?: string;

  /**
   * Normalized MIME type.
   */
  readonly mimeType?: string;

  /**
   * Original file size in bytes.
   */
  readonly fileSizeBytes?: number;

  /**
   * Content checksum.
   *
   * The document subsystem should eventually standardize
   * the checksum algorithm used here.
   */
  readonly checksum?: string;

  /**
   * Metadata contract version.
   */
  readonly version?: number;

  /**
   * Allows parsers to preserve metadata that is specific
   * to a format without polluting the canonical contract.
   */
  readonly custom?: Readonly<Record<string, unknown>>;
}

/**
 * Current canonical metadata schema version.
 */
export const DOCUMENT_METADATA_VERSION = 1;

/**
 * Safely creates a metadata object.
 *
 * Arrays and objects are copied so callers cannot accidentally
 * mutate the source metadata through the returned object.
 */
export function createDocumentMetadata(
  metadata: DocumentMetadata = {},
): DocumentMetadata {
  return {
    ...metadata,

    version: metadata.version ?? DOCUMENT_METADATA_VERSION,

    keywords: metadata.keywords ? [...metadata.keywords] : undefined,

    custom: metadata.custom ? { ...metadata.custom } : undefined,
  };
}
