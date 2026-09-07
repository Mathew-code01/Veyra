// shared/contracts/document.contract.ts


import type {
  UUID,
  Result,
  PaginatedResponse,
  ListQuery,
} from "../types/common";

import type {
  Document,
  DocumentContent,
  DocumentListItem,
} from "../types/documents";

export interface DocumentCreateRequest {
  readonly name: string;
  readonly type: Document["type"];
  readonly format: Document["metadata"]["format"];
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly path?: string;
}

export interface DocumentReadRequest {
  readonly documentId: UUID;
}

export interface DocumentReadResponse {
  readonly document: DocumentContent;
}

export interface DocumentListRequest
  extends ListQuery {
  readonly type?: Document["type"];
}

export type DocumentListResponse =
  PaginatedResponse<DocumentListItem>;

export interface DocumentDeleteRequest {
  readonly documentId: UUID;
}

export interface DocumentDeleteResponse {
  readonly documentId: UUID;
  readonly deleted: boolean;
}

export interface DocumentPickResponse {
  readonly cancelled: boolean;
  readonly document?: Document;
}

export type DocumentReadResult =
  Result<DocumentReadResponse>;

export type DocumentDeleteResult =
  Result<DocumentDeleteResponse>;

export type DocumentListResult =
  Result<DocumentListResponse>;

export type DocumentPickResult =
  Result<DocumentPickResponse>;