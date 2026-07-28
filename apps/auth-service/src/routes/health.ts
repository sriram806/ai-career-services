import * as net from 'node:net';
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
      const host = process.env.SMTP_HOST || 'smtp.gmail.com';
      const port = Number(process.env.SMTP_PORT) || 465;
      const isSecure = port === 465 || process.env.SMTP_SECURE === 'true';

      let ipv4Addresses: string[] = [];
      let ipv6Addresses: string[] = [];
      let dnsError: string | null = null;
      let tcpSuccess = false;
      let tcpLatencyMs = -1;
      let tcpError: string | null = null;

      // 1. DNS Resolution
      const dnsStartTime = Date.now();
      try {
        ipv4Addresses = await dns.resolve4(host);
      } catch (err: any) {
        dnsError = err?.message || String(err);
      }

      try {
        ipv6Addresses = await dns.resolve6(host);
      } catch (err: any) {
        // Log IPv6 resolution result or fallback silently
      }
      const dnsLatencyMs = Date.now() - dnsStartTime;

      // 2. TCP Socket Connectivity Test (Forced IPv4)
      if (ipv4Addresses.length > 0) {
        const tcpStart = Date.now();
        await new Promise<void>((resolve) => {
          const socket = net.connect(
            {
              host: ipv4Addresses[0],
              port,
              family: 4,
              timeout: 5000,
            },
            () => {
              tcpSuccess = true;
              tcpLatencyMs = Date.now() - tcpStart;
              socket.destroy();
              resolve();
            },
          );

          socket.on('error', (err) => {
            tcpError = err.message;
            socket.destroy();
            resolve();
          });

          socket.on('timeout', () => {
            tcpError = 'TCP Connection Timeout (5000ms)';
            socket.destroy();
            resolve();
          });
        });
      } else {
        tcpError = 'Skipped TCP test due to IPv4 DNS resolution failure';
      }

      // 3. SMTP Transporter Verification
      let smtpAuthVerified = false;
      let smtpAuthError: string | null = null;
      const emailProvider = (fastify as any).emailProvider;

      if (emailProvider && typeof emailProvider.verifyConnection === 'function') {
        const verifyResult = await emailProvider.verifyConnection();
        smtpAuthVerified = verifyResult.success;
        smtpAuthError = verifyResult.error ?? null;
      }

      const overallStatus = tcpSuccess && (smtpAuthVerified || !process.env.SMTP_USER) ? 'healthy' : 'unhealthy';
      const statusCode = overallStatus === 'healthy' ? 200 : 503;

      return reply.status(statusCode).send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        smtp: {
          host,
          port,
          secure: isSecure,
          from: process.env.SMTP_FROM || 'AI Career OS <boddusriram1234@gmail.com>',
          userConfigured: Boolean(process.env.SMTP_USER),
          authVerified: smtpAuthVerified,
          authError: smtpAuthError,
        },
        dns: {
          host,
          ipv4: ipv4Addresses,
          ipv6: ipv6Addresses,
          latencyMs: dnsLatencyMs,
          error: dnsError,
        },
        tcp: {
          connected: tcpSuccess,
          targetIp: ipv4Addresses[0] ?? null,
          port,
          latencyMs: tcpLatencyMs,
          error: tcpError,
        },
      });
    },
  );

  done();
};
