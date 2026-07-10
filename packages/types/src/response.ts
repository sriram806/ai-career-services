/**
 * Standard API Response Envelope.
 * Every API endpoint in AI Career OS must return responses in this format.
 * This ensures consistent client-side parsing and error handling.
 */

/** Metadata attached to successful responses */
export interface ResponseMetadata {
  readonly requestId: string;
  readonly timestamp: string;
  readonly version?: string;
  readonly pagination?: PaginationMeta;
}

/** Pagination metadata for list responses */
export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}

/** Standard success response envelope */
export interface ApiSuccessResponse<T = unknown> {
  readonly success: true;
  readonly data: T;
  readonly metadata: ResponseMetadata;
}

/** Standard error detail */
export interface ApiErrorDetail {
  readonly field?: string;
  readonly message: string;
  readonly code?: string;
}

/** Standard error response envelope */
export interface ApiErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly timestamp: string;
    readonly details?: ApiErrorDetail[];
    readonly stack?: string;
  };
}

/** Union type for all API responses */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
