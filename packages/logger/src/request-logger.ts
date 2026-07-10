import crypto from 'node:crypto';

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';

/**
 * Fastify plugin for request/response logging with correlation IDs.
 *
 * - Generates unique request IDs (UUID v4) if not provided
 * - Propagates correlation IDs from upstream services
 * - Logs request start and response completion with timing
 * - Creates child logger with request context for downstream use
 */
export const requestLoggerPlugin: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done,
) => {
  // Generate request IDs
  fastify.addHook('onRequest', async (request, reply) => {
    const requestId =
      (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? requestId;

    // Set headers on the reply
    void reply.header('x-request-id', requestId);
    void reply.header('x-correlation-id', correlationId);

    // Create child logger with request context
    request.log = request.log.child({
      requestId,
      correlationId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    request.log.info('Request started');
  });

  // Log response completion
  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'Request completed',
    );
  });

  done();
};
