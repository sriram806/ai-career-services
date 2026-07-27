import { CONSTANTS } from '@ai-career-os/common';

import type { ServiceStatus } from '@ai-career-os/types';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';

const startTime = Date.now();

export const healthRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  fastify.get(
    CONSTANTS.API.HEALTH_PATH,
    {
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
    },
    async (_request, _reply) => {
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
    },
  );

  fastify.get(
    `${CONSTANTS.API.HEALTH_PATH}/ready`,
    {
      schema: { description: 'Readiness check', tags: ['health'] },
    },
    async (_request, reply) => {
      void reply.status(200).send({ status: 'ready' });
    },
  );

  fastify.get(
    '/health/email',
    {
      schema: { description: 'Email service health & SMTP diagnostics', tags: ['health'] },
    },
    async (_request, reply) => {
      const dns = await import('node:dns/promises');
      let ipv4Addresses: string[] = [];
      let ipv6Addresses: string[] = [];
      let dnsError: string | null = null;

      try {
        ipv4Addresses = await dns.resolve4(process.env.SMTP_HOST || 'smtp-relay.brevo.com');
      } catch (err: any) {
        dnsError = err?.message || String(err);
      }

      try {
        ipv6Addresses = await dns.resolve6(process.env.SMTP_HOST || 'smtp-relay.brevo.com');
      } catch (err: any) {
        // Ignore IPv6 lookup errors
      }

      return reply.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        smtp: {
          host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          from: process.env.SMTP_FROM || 'AI Career OS <boddusriram1234@gmail.com>',
          userConfigured: Boolean(process.env.SMTP_USER),
        },
        dns: {
          ipv4: ipv4Addresses,
          ipv6: ipv6Addresses,
          error: dnsError,
        },
      });
    },
  );

  done();
};
