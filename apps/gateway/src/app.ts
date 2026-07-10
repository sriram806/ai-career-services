import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import compress from '@fastify/compress';
import replyFrom from '@fastify/reply-from';

import { requestLoggerPlugin } from '@ai-career-os/logger';
import { CONSTANTS } from '@ai-career-os/common';

import { getGatewayConfig } from './config/gateway-config';
import { redisPlugin } from './plugins/redis';
import { gatewayErrorHandler } from './middlewares/error-handler';
import { healthRoutes } from './routes/health';
import { gatewayRoutes } from './routes/gateway-routes';

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

/**
 * Build and configure the Fastify API Gateway application.
 * Follows the factory pattern for testability and containerization.
 */
export async function buildApp(logger: Logger): Promise<FastifyInstance<any, any, any, any>> {
  const config = getGatewayConfig();

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: CONSTANTS.HEADERS.REQUEST_ID,
    disableRequestLogging: true, // Custom request log plugin handles this
  });

  // ─── Custom Plugins ───────────────────────────────
  await app.register(requestLoggerPlugin);

  // ─── Security Plugins ─────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    frameguard: { action: 'deny' }, // Anti-clickjacking
    noSniff: true, // X-Content-Type-Options
    referrerPolicy: { policy: 'same-origin' },
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Correlation-ID',
      'Accept',
    ],
  });

  // Compression
  await app.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate', 'br'],
  });

  // ─── Redis Connection ─────────────────────────────
  await app.register(redisPlugin);

  // ─── Rate Limiting (Redis-backed) ─────────────────
  await app.register(rateLimit, {
    redis: app.redis,
    keyGenerator: (request) => {
      // Rate limit by IP or authenticated user ID
      return request.user?.userId || request.ip;
    },
    // Default fallback limits
    max: config.RATE_LIMIT_STANDARD,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  });

  // ─── Reverse Proxy Plugin ─────────────────────────
  await app.register(replyFrom, {
    // Undici connection pooling configuration
    undici: {
      connections: 200, // Maximum pool size
      pipelining: 10,
      keepAliveTimeout: 60000, // 60s socket keep-alive
    },
    disableCache: true,
  });

  // ─── Documentation (Swagger) ──────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AI Career OS — API Gateway',
        description: 'Production-Grade API Gateway for AI Career OS microservices platform.',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.PORT}`, description: 'Local Gateway' },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter JWT Bearer token format: Bearer <token>',
          },
        },
      },
      security: [
        { BearerAuth: [] },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: CONSTANTS.API.DOCS_PATH,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // ─── Global Error Handler ─────────────────────────
  app.setErrorHandler(gatewayErrorHandler);

  // ─── Routes ───────────────────────────────────────
  // Health endpoints (liveness, readiness)
  await app.register(healthRoutes);
  
  // Downstream proxied routes
  await app.register(gatewayRoutes);

  return app;
}
