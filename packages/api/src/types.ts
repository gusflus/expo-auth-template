/**
 * Pagination metadata for paginated API responses
 */
export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Base metadata included in all API responses
 */
export interface ResponseMeta {
  timestamp: string;
  requestId?: string;
  version?: string;
}

/**
 * Standard API response wrapper that extends with data type T
 * Includes pagination and metadata by default
 */
export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
  pagination?: PaginationMeta;
}

/**
 * API error response
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Query parameters for API requests
 */
export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Request configuration for useApiRequest hook
 */
export interface ApiRequestConfig<TData = any, TBody = any> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  query?: QueryParams;
  body?: TBody;
  enabled?: boolean;
}

export type { UseQueryResult } from "@tanstack/react-query";
