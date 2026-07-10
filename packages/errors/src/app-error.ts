import { ErrorCode, ERROR_STATUS_MAP } from '@ai-career-os/types';

import type { ApiErrorDetail } from '@ai-career-os/types';

/**
 * Base application error class.
 * All domain-specific errors extend this.
 * Carries structured error information for consistent API responses.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: ApiErrorDetail[];

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      isOperational?: boolean;
      details?: ApiErrorDetail[];
      cause?: Error;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_STATUS_MAP[code];
    this.isOperational = options?.isOperational ?? true;
    this.details = options?.details;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize to API error response format.
   */
  public toJSON(requestId: string): object {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        requestId,
        timestamp: new Date().toISOString(),
        details: this.details,
        ...(process.env['NODE_ENV'] === 'development' && { stack: this.stack }),
      },
    };
  }
}
