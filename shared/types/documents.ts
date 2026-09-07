// shared/types/documents.ts

import type { Entity, UUID } from "./common";

export type DocumentType =
  | "resume"
  | "cover-letter"
  | "job-description"
  | "project"
  | "company-research"
  | "notes"
  | "other";

export type DocumentFormat = "pdf" | "docx" | "txt" | "md" | "json" | "unknown";

export interface DocumentMetadata {
  readonly mimeType: string;
  readonly format: DocumentFormat;
  readonly sizeBytes: number;
  readonly checksum?: string;
  readonly pageCount?: number;
  readonly wordCount?: number;
}

export interface Document extends Entity {
  readonly name: string;
  readonly type: DocumentType;
  readonly metadata: DocumentMetadata;
  readonly path?: string;
  readonly indexed: boolean;
  readonly indexedAt?: string;
}

export interface DocumentContent {
  readonly documentId: UUID;
  readonly text: string;
  readonly extractedAt: string;
}

export interface DocumentChunk {
  readonly id: UUID;
  readonly documentId: UUID;
  readonly text: string;
  readonly index: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly tokenCount?: number;
}

export interface DocumentListItem {
  readonly id: UUID;
  readonly name: string;
  readonly type: DocumentType;
  readonly format: DocumentFormat;
  readonly sizeBytes: number;
  readonly indexed: boolean;
  readonly updatedAt: string;
}