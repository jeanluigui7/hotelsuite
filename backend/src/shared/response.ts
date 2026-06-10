/**
 * Standard response envelope: { data, meta, error }.
 * Every controller responds through these helpers.
 */
export interface ResponseMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T | null;
  meta: ResponseMeta | null;
  error: ApiError | null;
}

export function ok<T>(data: T, meta: ResponseMeta | null = null): ApiResponse<T> {
  return { data, meta, error: null };
}

export function fail(error: ApiError): ApiResponse<null> {
  return { data: null, meta: null, error };
}
