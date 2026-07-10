/**
 * Pagination types for list endpoints.
 */

/** Pagination query parameters from client */
export interface PaginationParams {
  readonly page: number;
  readonly limit: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
}

/** Default pagination values */
export const PAGINATION_DEFAULTS: Required<Pick<PaginationParams, 'page' | 'limit'>> = {
  page: 1,
  limit: 20,
} as const;

/** Maximum allowed page size */
export const MAX_PAGE_SIZE = 100;
