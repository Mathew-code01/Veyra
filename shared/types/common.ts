// ============================================================================
// FILE: shared/types/common.ts
// PURPOSE:
// Canonical shared primitive and transport types.
//
// This file must remain dependency-light.
// ============================================================================

export type ISODateString = string;

export type UUID = string;

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

// ============================================================================
// RESULT
// ============================================================================

export type Result<T, E = Error> =
  | {
      readonly success: true;
      readonly data: T;
    }
  | {
      readonly success: false;
      readonly error: E;
    };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// ============================================================================
// PAGINATION
// ============================================================================

export interface Pagination {
  readonly page: number;

  readonly pageSize: number;

  readonly total: number;

  readonly hasNextPage: boolean;

  readonly totalPages: number;
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[];

  readonly pagination: Pagination;
}

// ============================================================================
// ENTITY
// ============================================================================

export interface Timestamped {
  readonly createdAt: ISODateString;

  readonly updatedAt: ISODateString;
}

export interface Identifiable {
  readonly id: UUID;
}

export interface Entity extends Identifiable, Timestamped {}

// ============================================================================
// REQUEST METADATA
// ============================================================================

export interface RequestMetadata {
  readonly requestId: UUID;

  readonly timestamp: ISODateString;

  readonly source: "client" | "desktop" | "server" | "core";
}

// ============================================================================
// SORTING
// ============================================================================

export interface SortOptions {
  readonly field: string;

  readonly direction: "asc" | "desc";
}

// ============================================================================
// PAGINATION QUERY
// ============================================================================

export interface PaginationParams {
  readonly page?: number;

  readonly pageSize?: number;
}

export interface ListQuery extends PaginationParams {
  readonly search?: string;

  readonly sort?: SortOptions;
}
