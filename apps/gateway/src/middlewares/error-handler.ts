import { ErrorCode } from '@ai-career-os/types';
import { AppError } from '@ai-career-os/errors';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Enterprise API Gateway Error Handler.
 * Strictly adheres to the required error payload format:
 * {
 *   "error": {
 *     "code": "...",
 *     "message": "...",
 *     "requestId": "...",
 *     "details": {}
 *   }
 * }
 */
export function gatewayErrorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = (request.id as string) ?? 'unknown';
  const isProduction = process.env['NODE_ENV'] === 'production';

  // 1. Handle AppError (domain-specific errors)
  if (error instanceof AppError) {
    const statusCode = error.statusCode ?? 500;
    
    // Normalize details array to object format if requested
    const detailsObj: Record<string, any> = {};
    if (error.details && Array.isArray(error.details)) {
      error.details.forEach((d) => {
        if (d.field) {
          detailsObj[d.field] = d.message;
        } else {
          detailsObj['validation'] = d.message;
        }
      });
    }

    void reply.status(statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: detailsObj,
      },
    });
    return;
  }

  // 2. Handle Fastify Validation Errors
  if ('validation' in error && error.validation) {
    const detailsObj: Record<string, string> = {};
    error.validation.forEach((v) => {
      const field = (v.params?.['missingProperty'] as string) || v.instancePath || 'body';
      detailsObj[field] = v.message || 'Validation error';
    });

    void reply.status(422).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed',
        requestId,
        details: detailsObj,
      },
    });
    return;
  }

  // 3. Handle standard Fastify errors with custom statuses
  if ('statusCode' in error && typeof error.statusCode === 'number') {
    void reply.status(error.statusCode).send({
      error: {
        code: ErrorCode.BAD_REQUEST,
        message: error.message,
        requestId,
        details: {},
      },
    });
    return;
  }

  // 4. Default: Handle uncaught internal/external errors
  // Log the real error with stack trace for observability
  request.log.error({ err: error, requestId }, 'Unhandled Gateway error');

  // Determine error code and status
  let code = ErrorCode.INTERNAL_SERVER_ERROR;
  let status = 500;
  let message = 'An unexpected error occurred';

  // Mask downstream connection errors
  if ('code' in error) {
    const errCode = (error as any).code;
    if (
      errCode === 'ECONNREFUSED' ||
      errCode === 'ECONNRESET' ||
      errCode === 'ETIMEDOUT' ||
      errCode === 'UND_ERR_HEADERS_TIMEOUT' ||
      errCode === 'UND_ERR_BODY_TIMEOUT'
    ) {
      code = ErrorCode.EXTERNAL_SERVICE_ERROR;
      status = 502;
      message = 'Failed to communicate with upstream service';
    }
  }

  // If in development/testing mode, we can show more detail
  const devDetails = !isProduction
    ? {
        stack: error.stack,
        originalMessage: error.message,
      }
    : {};

  void reply.status(status).send({
    error: {
      code,
      message,
      requestId,
      details: devDetails,
    },
  });
}
