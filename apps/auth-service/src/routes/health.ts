import { CONSTANTS } from '@ai-career-os/common';

import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import type { ServiceStatus } from '@ai-career-os/types';

const startTime = Date.now();

export const healthRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done,
) => {
  fastify.get(CONSTANTS.API.HEALTH_PATH, {
    schema: {
      description: 'Health check endpoint',
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
  }, async (_request, _reply) => {
    const status: ServiceStatus = 'healthy';
    return {
      status,
      service: 'auth-service',
      version: '0.1.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        server: { status: 'healthy' },
      },
    };
  });

  fastify.get(`${CONSTANTS.API.HEALTH_PATH}/ready`, {
    schema: { description: 'Readiness check', tags: ['health'] },
  }, async (_request, reply) => {
    void reply.status(200).send({ status: 'ready' });
  });

  done();
};
