import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { errorHandler } from '@ai-career-os/errors';
import { requestLoggerPlugin } from '@ai-career-os/logger';
import { CONSTANTS } from '@ai-career-os/common';

import { healthRoutes } from './routes/health';


/**
 * Build and configure the Notification Service Fastify application.
 */
export async function buildApp(logger: any): Promise<any> {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: CONSTANTS.HEADERS.REQUEST_ID,
    disableRequestLogging: true,
  });

  // ─── Security ─────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:3000',
    credentials: true,
  });

  // ─── Documentation ────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Career OS — Notification Service',
        description: 'Notification Service API',
        version: '0.1.0',
      },
      servers: [
        { url: 'http://localhost:3008', description: 'Development' },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: CONSTANTS.API.DOCS_PATH,
  });

  // ─── Plugins ──────────────────────────────────────
  await app.register(requestLoggerPlugin);

  // ─── Error Handler ────────────────────────────────
  app.setErrorHandler(errorHandler);

  // ─── Routes ───────────────────────────────────────
  await app.register(healthRoutes);

  return app;
}
