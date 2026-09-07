// shared/types/common.ts

export type ISODateString = string;

export type UUID = string;

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

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

export interface Timestamped {
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface Identifiable {
  readonly id: UUID;
}

export interface Entity extends Identifiable, Timestamped {}

export interface RequestMetadata {
  readonly requestId: UUID;
  readonly timestamp: ISODateString;
  readonly source: "client" | "desktop" | "server" | "core";
}

export interface SortOptions {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

export interface PaginationParams {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ListQuery extends PaginationParams {
  readonly search?: string;
  readonly sort?: SortOptions;
}