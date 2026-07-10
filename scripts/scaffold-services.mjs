/**
 * Service scaffolding script.
 * Generates all 8 remaining Node.js microservices programmatically.
 *
 * Run: node scripts/scaffold-services.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const SERVICES = [
  { name: 'auth-service', port: 3001, title: 'Authentication Service' },
  { name: 'user-service', port: 3002, title: 'User Service' },
  { name: 'career-service', port: 3003, title: 'Career Service' },
  { name: 'exam-service', port: 3004, title: 'Exam Service' },
  { name: 'organization-service', port: 3006, title: 'Organization Service' },
  { name: 'billing-service', port: 3007, title: 'Billing Service' },
  { name: 'notification-service', port: 3008, title: 'Notification Service' },
  { name: 'admin-service', port: 3009, title: 'Admin Service' },
];

const DIRS = [
  'src/controllers', 'src/routes', 'src/services', 'src/repositories',
  'src/entities', 'src/middlewares', 'src/plugins', 'src/config',
  'src/schemas', 'src/validators', 'src/dto', 'src/events',
  'src/jobs', 'src/utils', 'src/types',
  'tests/unit', 'tests/integration', 'tests/helpers',
];

function generatePackageJson(svc) {
  return JSON.stringify({
    name: `@ai-career-os/${svc.name}`,
    version: '0.1.0',
    private: true,
    scripts: {
      build: 'tsc --project tsconfig.json',
      dev: 'tsx watch src/server.ts',
      start: 'node dist/server.js',
      clean: 'rimraf dist',
      typecheck: 'tsc --noEmit',
      lint: 'eslint src/ --ext .ts',
      'lint:fix': 'eslint src/ --ext .ts --fix',
      test: 'vitest run',
      'test:watch': 'vitest watch',
      'test:coverage': 'vitest run --coverage',
    },
    dependencies: {
      '@ai-career-os/common': '*',
      '@ai-career-os/config': '*',
      '@ai-career-os/errors': '*',
      '@ai-career-os/logger': '*',
      '@ai-career-os/types': '*',
      '@ai-career-os/database': '*',
      '@ai-career-os/events': '*',
      '@ai-career-os/validation': '*',
      '@fastify/cors': '^10.0.0',
      '@fastify/helmet': '^12.0.0',
      '@fastify/swagger': '^9.4.0',
      '@fastify/swagger-ui': '^5.2.0',
      fastify: '^5.2.0',
    },
    devDependencies: {
      rimraf: '^6.0.0',
      tsx: '^4.19.0',
      typescript: '^5.7.0',
      vitest: '^2.1.0',
    },
  }, null, 2);
}

function generateTsconfig() {
  return JSON.stringify({
    extends: '../../tsconfig.base.json',
    compilerOptions: { outDir: './dist', rootDir: './src' },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist', 'tests'],
  }, null, 2);
}

function generateVitestConfig() {
  return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/'],
    },
    testTimeout: 10000,
  },
});
`;
}

function generateAppTs(svc) {
  return `import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { errorHandler } from '@ai-career-os/errors';
import { requestLoggerPlugin } from '@ai-career-os/logger';
import { CONSTANTS } from '@ai-career-os/common';

import { healthRoutes } from './routes/health';

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

/**
 * Build and configure the ${svc.title} Fastify application.
 */
export async function buildApp(logger: Logger): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
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
        title: 'AI Career OS — ${svc.title}',
        description: '${svc.title} API',
        version: '0.1.0',
      },
      servers: [
        { url: 'http://localhost:${svc.port}', description: 'Development' },
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
`;
}

function generateServerTs(svc) {
  return `import { loadConfig } from '@ai-career-os/config';
import { createLogger } from '@ai-career-os/logger';

import { buildApp } from './app';

const SERVICE_NAME = '${svc.name}';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(SERVICE_NAME, { level: config.LOG_LEVEL });
  const app = await buildApp(logger);

  // ─── Graceful Shutdown ────────────────────────────
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, () => {
      logger.info({ signal }, 'Received shutdown signal');
      void app.close().then(() => {
        logger.info('Server closed gracefully');
        process.exit(0);
      });
    });
  }

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled rejection');
    process.exit(1);
  });

  // ─── Start Server ─────────────────────────────────
  try {
    const port = ${svc.port};
    await app.listen({ port, host: '0.0.0.0' });
    logger.info({ port, environment: config.NODE_ENV }, \`\${SERVICE_NAME} started\`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
`;
}

function generateHealthRoutes(svc) {
  return `import { CONSTANTS } from '@ai-career-os/common';

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
      service: '${svc.name}',
      version: '0.1.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        server: { status: 'healthy' },
      },
    };
  });

  fastify.get(\`\${CONSTANTS.API.HEALTH_PATH}/ready\`, {
    schema: { description: 'Readiness check', tags: ['health'] },
  }, async (_request, reply) => {
    void reply.status(200).send({ status: 'ready' });
  });

  done();
};
`;
}

function generateTest(svc) {
  return `import { describe, it, expect } from 'vitest';

describe('${svc.title} Health Check', () => {
  it('should be a valid test suite', () => {
    expect(true).toBe(true);
  });
});
`;
}

// ─── Main ───────────────────────────────────────────────
const rootDir = process.cwd();

for (const svc of SERVICES) {
  const svcDir = path.join(rootDir, 'apps', svc.name);

  // Create directories
  for (const dir of DIRS) {
    fs.mkdirSync(path.join(svcDir, dir), { recursive: true });
  }

  // Write files
  fs.writeFileSync(path.join(svcDir, 'package.json'), generatePackageJson(svc));
  fs.writeFileSync(path.join(svcDir, 'tsconfig.json'), generateTsconfig());
  fs.writeFileSync(path.join(svcDir, 'vitest.config.ts'), generateVitestConfig());
  fs.writeFileSync(path.join(svcDir, 'src', 'app.ts'), generateAppTs(svc));
  fs.writeFileSync(path.join(svcDir, 'src', 'server.ts'), generateServerTs(svc));
  fs.writeFileSync(path.join(svcDir, 'src', 'routes', 'health.ts'), generateHealthRoutes(svc));
  fs.writeFileSync(path.join(svcDir, 'tests', 'unit', 'health.test.ts'), generateTest(svc));

  // Create .gitkeep files in empty directories
  for (const dir of DIRS) {
    const dirPath = path.join(svcDir, dir);
    const files = fs.readdirSync(dirPath);
    if (files.length === 0) {
      fs.writeFileSync(path.join(dirPath, '.gitkeep'), '');
    }
  }

  console.log(`✅ Scaffolded ${svc.name} (port ${svc.port})`);
}

console.log('\n✅ All services scaffolded successfully!');
