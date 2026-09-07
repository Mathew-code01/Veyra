export type ISODateString = string;
export type UUID = string;
export type Nullable<T> = T | null;
export type Result<T, E = Error> = {
    success: true;
    data: T;
} | {
    success: false;
    error: E;
};
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
export interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    hasNextPage: boolean;
}
export interface PaginatedResponse<T> {
    items: T[];
    pagination: Pagination;
}
export interface Timestamped {
    createdAt: ISODateString;
    updatedAt: ISODateString;
}
