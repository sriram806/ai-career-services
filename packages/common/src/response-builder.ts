import type { ApiSuccessResponse, PaginationMeta, ResponseMetadata } from '@ai-career-os/types';

/**
 * Build a standard success response envelope.
 * Every API handler should use this to ensure consistent response format.
 */
export function createSuccessResponse<T>(
  data: T,
  requestId: string,
  options?: { version?: string },
): ApiSuccessResponse<T> {
  const metadata: ResponseMetadata = {
    requestId,
    timestamp: new Date().toISOString(),
    version: options?.version ?? '1.0.0',
  };

  return {
    success: true,
    data,
    metadata,
  };
}

/**
 * Build a paginated success response envelope.
 */
export function createPaginatedResponse<T>(
  data: T[],
  requestId: string,
  pagination: {
    page: number;
    limit: number;
    total: number;
  },
  options?: { version?: string },
): ApiSuccessResponse<T[]> {
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  const paginationMeta: PaginationMeta = {
    page: pagination.page,
    limit: pagination.limit,
    total: pagination.total,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrevious: pagination.page > 1,
  };

  const metadata: ResponseMetadata = {
    requestId,
    timestamp: new Date().toISOString(),
    version: options?.version ?? '1.0.0',
    pagination: paginationMeta,
  };

  return {
    success: true,
    data,
    metadata,
  };
}
