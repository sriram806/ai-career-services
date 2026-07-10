import { CONSTANTS } from '@ai-career-os/common';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type { ServiceStatus } from '@ai-career-os/types';

const startTime = Date.now();

/**
 * Health check routes.
 * Provides liveness and readiness probes for Kubernetes.
 */
export const healthRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done,
) => {
  /**
   * Liveness probe — is the process alive?
   */
  fastify.get(
    CONSTANTS.API.HEALTH_PATH,
    {
      schema: {
        description: 'Liveness health check endpoint',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const status: ServiceStatus = 'healthy';
      return {
        status,
        service: 'gateway',
        version: '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        timestamp: new Date().toISOString(),
      };
    },
  );

  /**
   * Readiness probe — is the service ready to handle traffic?
   * Checks the connection state to Redis.
   */
  fastify.get(
    `${CONSTANTS.API.HEALTH_PATH}/ready`,
    {
      schema: {
        description: 'Readiness check endpoint (checks Redis status)',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  redis: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  redis: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const isRedisHealthy = await fastify.redisConnection.healthCheck();

      if (!isRedisHealthy) {
        return reply.status(503).send({
          status: 'unhealthy',
          checks: {
            redis: 'unhealthy',
          },
        });
      }

      return reply.status(200).send({
        status: 'ready',
        checks: {
          redis: 'healthy',
        },
      });
    },
  );

  done();
};
