import { ErrorCode } from '@ai-career-os/types';

import { AppError } from './app-error';

import type { ApiErrorDetail } from '@ai-career-os/types';

/**
 * Factory for creating common application errors.
 * Provides semantic, type-safe error creation methods.
 */
export class ErrorFactory {
  static badRequest(message: string, details?: ApiErrorDetail[]): AppError {
    return new AppError(ErrorCode.BAD_REQUEST, message, { details });
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }

  static notFound(resource: string, id?: string): AppError {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    return new AppError(ErrorCode.RESOURCE_NOT_FOUND, message);
  }

  static conflict(message: string): AppError {
    return new AppError(ErrorCode.CONFLICT, message);
  }

  static validationError(details: ApiErrorDetail[]): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, 'Validation failed', { details });
  }

  static internal(message = 'Internal server error', cause?: Error): AppError {
    return new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, {
      isOperational: false,
      cause,
    });
  }

  static databaseError(message: string, cause?: Error): AppError {
    return new AppError(ErrorCode.DATABASE_ERROR, message, {
      isOperational: false,
      cause,
    });
  }

  static externalServiceError(service: string, cause?: Error): AppError {
    return new AppError(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `External service '${service}' failed`,
      { cause },
    );
  }

  static rateLimitExceeded(): AppError {
    return new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many requests');
  }

  static tokenExpired(): AppError {
    return new AppError(ErrorCode.TOKEN_EXPIRED, 'Token has expired');
  }

  static tokenInvalid(): AppError {
    return new AppError(ErrorCode.TOKEN_INVALID, 'Invalid token');
  }

  static insufficientPermissions(requiredRole?: string): AppError {
    const message = requiredRole
      ? `Insufficient permissions. Required role: ${requiredRole}`
      : 'Insufficient permissions';
    return new AppError(ErrorCode.INSUFFICIENT_PERMISSIONS, message);
  }
}
