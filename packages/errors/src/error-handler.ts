import { ErrorCode } from '@ai-career-os/types';

import { AppError } from './app-error';

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Global Fastify error handler.
 * Converts all errors to the standard API error response format.
 */
export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = (request.id as string) ?? 'unknown';

  // Handle AppError (our domain errors)
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send(error.toJSON(requestId));
    return;
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    const details = error.validation.map((v) => ({
      field: v.params?.['missingProperty'] as string | undefined,
      message: v.message ?? 'Validation error',
    }));

    const appError = new AppError(ErrorCode.VALIDATION_ERROR, 'Validation failed', { details });
    void reply.status(422).send(appError.toJSON(requestId));
    return;
  }

  // Handle Fastify-specific errors with status codes
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    void reply.status(error.statusCode).send({
      success: false,
      error: {
        code: ErrorCode.BAD_REQUEST,
        message: error.message,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Handle unknown errors — never leak internals in production
  request.log.error({ err: error, requestId }, 'Unhandled error');

  void reply.status(500).send({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message:
        process.env['NODE_ENV'] === 'production'
          ? 'An unexpected error occurred'
          : error.message,
      requestId,
      timestamp: new Date().toISOString(),
      ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack }),
    },
  });
}
