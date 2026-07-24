import { getGatewayConfig } from '../config/gateway-config';
import { proxyTo } from '../proxy/reverse-proxy';
import { authenticateRequest } from '../middlewares/auth';
import { validateRequestSecurity } from '../middlewares/validation';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';

/**
 * Configure service routing and tiered rate limiting.
 */
export const gatewayRoutes: FastifyPluginCallback = (fastify: FastifyInstance, _opts, done) => {
  const config = getGatewayConfig();

  // Apply authentication & security validation to all routes registered in this plugin
  fastify.addHook('preHandler', authenticateRequest);
  fastify.addHook('preHandler', validateRequestSecurity);

  // ─── Rate Limit Tiers ─────────────────────────────
  const veryStrictLimit = {
    max: config.RATE_LIMIT_VERY_STRICT,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  };

  const moderateLimit = {
    max: config.RATE_LIMIT_MODERATE,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  };

  // ─── Downstream Proxy Routes ──────────────────────

  // 1a. Auth Service - Session, Audit, and OAuth endpoints -> Moderate (60 requests/min)
  fastify.all(
    '/api/v1/auth/oauth/*',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'OAuth authentication integration endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.all(
    '/api/v1/auth/sessions',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Active session list and audit endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.all(
    '/api/v1/auth/sessions/*',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Active session revocation endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.all(
    '/api/v1/auth/devices',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Registered trust device endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.all(
    '/api/v1/auth/devices/*',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Trust device management endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.all(
    '/api/v1/auth/security/events',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Security and audit event log endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.get(
    '/api/v1/auth/me',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Get current authenticated user identity',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  fastify.post(
    '/api/v1/auth/refresh',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Rotate access tokens',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  // 1b. Auth Service (Catch-all for login, register, password reset, MFA) -> Very Strict (5 requests/min)
  fastify.all(
    '/api/v1/auth/*',
    {
      config: { rateLimit: veryStrictLimit },
      schema: {
        description: 'Authentication and identity service endpoints',
        tags: ['Auth'],
      },
    },
    proxyTo(config.AUTH_SERVICE_URL, 'auth-service'),
  );

  done();
};

