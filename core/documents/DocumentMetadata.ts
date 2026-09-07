// core/documents/DocumentMetadata.ts

import type {
  DocumentType,
} from "../context/DocumentParser";

export interface DocumentMetadataRecord {
  readonly id: string;
  readonly candidateId?: string;
  readonly name: string;
  readonly type: DocumentType;
  readonly mimeType?: string;
  readonly fileName?: string;
  readonly fileSize?: number;
  readonly checksum?: string;
  readonly source?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pageCount?: number;
  readonly language?: string;
  readonly tags: readonly string[];
}

export function createDocumentMetadata(
  input: Omit<
    DocumentMetadataRecord,
    "createdAt" | "updatedAt"
  >,
): DocumentMetadataRecord {
  const now = new Date().toISOString();

  return {
    ...input,
    tags: [...input.tags],
    createdAt: now,
    updatedAt: now,
  };
}