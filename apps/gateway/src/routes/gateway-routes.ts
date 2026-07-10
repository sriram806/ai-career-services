import { getGatewayConfig } from '../config/gateway-config';
import { proxyTo } from '../proxy/reverse-proxy';
import { authenticateRequest } from '../middlewares/auth';
import { validateRequestSecurity } from '../middlewares/validation';
import type { FastifyInstance, FastifyPluginCallback } from 'fastify';

/**
 * Configure service routing and tiered rate limiting.
 */
export const gatewayRoutes: FastifyPluginCallback = (
  fastify: FastifyInstance,
  _opts,
  done,
) => {
  const config = getGatewayConfig();

  // Apply authentication & security validation to all routes registered in this plugin
  fastify.addHook('preHandler', authenticateRequest);
  fastify.addHook('preHandler', validateRequestSecurity);

  // ─── Rate Limit Tiers ─────────────────────────────
  const veryStrictLimit = {
    max: config.RATE_LIMIT_VERY_STRICT,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  };

  const strictLimit = {
    max: config.RATE_LIMIT_STRICT,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  };

  const moderateLimit = {
    max: config.RATE_LIMIT_MODERATE,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  };

  const standardLimit = {
    max: config.RATE_LIMIT_STANDARD,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
  };

  // ─── Downstream Proxy Routes ──────────────────────

  // 1. Auth Service (/auth/*) -> Very Strict
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

  // 2. Profile Reads (/profile/* GET) -> Moderate
  fastify.get(
    '/api/v1/profile/*',
    {
      config: { rateLimit: moderateLimit },
      schema: {
        description: 'Candidate profile reading endpoints',
        tags: ['Profile'],
      },
    },
    proxyTo(config.USER_SERVICE_URL, 'user-service'),
  );

  // 3. Profile Writes (/profile/* POST/PUT/PATCH/DELETE) -> Standard
  fastify.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/api/v1/profile/*',
    config: { rateLimit: standardLimit },
    schema: {
      description: 'Candidate profile modification endpoints',
      tags: ['Profile'],
    },
    handler: proxyTo(config.USER_SERVICE_URL, 'user-service'),
  });

  // 4. AI Service (/ai/*) -> Strict
  fastify.all(
    '/api/v1/ai/*',
    {
      config: { rateLimit: strictLimit },
      schema: {
        description: 'AI resume analysis, coaching, and interview endpoints',
        tags: ['AI'],
      },
    },
    proxyTo(config.AI_SERVICE_URL, 'ai-service'),
  );

  // 5. Career Service (/career/*) -> Standard
  fastify.all(
    '/api/v1/career/*',
    {
      config: { rateLimit: standardLimit },
      schema: {
        description: 'Career pathing, jobs, and mentorship endpoints',
        tags: ['Career'],
      },
    },
    proxyTo(config.CAREER_SERVICE_URL, 'career-service'),
  );

  // 6. Exam Service (/exams/*) -> Standard
  fastify.all(
    '/api/v1/exams/*',
    {
      config: { rateLimit: standardLimit },
      schema: {
        description: 'Exams, certifications, and assessment endpoints',
        tags: ['Exams'],
      },
    },
    proxyTo(config.EXAM_SERVICE_URL, 'exam-service'),
  );

  // 7. Organization Service (/organization/*) -> Standard
  fastify.all(
    '/api/v1/organization/*',
    {
      config: { rateLimit: standardLimit },
      schema: {
        description: 'Organization, tenant, and corporate admin endpoints',
        tags: ['Organization'],
      },
    },
    proxyTo(config.ORGANIZATION_SERVICE_URL, 'organization-service'),
  );

  // 8. Billing Service (/billing/*) -> Standard
  fastify.all(
    '/api/v1/billing/*',
    {
      config: { rateLimit: standardLimit },
      schema: {
        description: 'Billing, subscription, and Stripe payment endpoints',
        tags: ['Billing'],
      },
    },
    proxyTo(config.BILLING_SERVICE_URL, 'billing-service'),
  );

  // 9. Notification Service (/notifications/*) -> Standard
  fastify.all(
    '/api/v1/notifications/*',
    {
      config: { rateLimit: standardLimit },
      schema: {
        description: 'User notification and alert preference endpoints',
        tags: ['Notifications'],
      },
    },
    proxyTo(config.NOTIFICATION_SERVICE_URL, 'notification-service'),
  );

  // 10. Admin Service (/admin/*) -> Very Strict
  fastify.all(
    '/api/v1/admin/*',
    {
      config: { rateLimit: veryStrictLimit },
      schema: {
        description: 'Platform administration and supervisor endpoints',
        tags: ['Admin'],
      },
    },
    proxyTo(config.ADMIN_SERVICE_URL, 'admin-service'),
  );

  // 11. Analytics Service (/analytics/*) -> Standard
  fastify.all(
    '/api/v1/analytics/*',
    {
      config: { rateLimit: standardLimit },
      schema: {
        description: 'System telemetry and analytics visualization endpoints',
        tags: ['Analytics'],
      },
    },
    proxyTo(config.ANALYTICS_SERVICE_URL, 'analytics-service'),
  );

  done();
};
