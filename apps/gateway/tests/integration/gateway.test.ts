import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database package's RedisConnection to run tests in isolation without running Redis
vi.mock('@ai-career-os/database', () => {
  const baseClient = {
    status: 'ready',
    on: vi.fn(),
    once: vi.fn((event, cb) => {
      if (cb) cb();
    }),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
    defineCommand: vi.fn(),
  };

  const mockClient = new Proxy(baseClient, {
    get(target, prop) {
      if (
        prop === 'then' ||
        prop === 'catch' ||
        prop === 'finally' ||
        prop === 'getter' ||
        prop === 'setter'
      ) {
        return undefined;
      }
      if (prop in target) {
        return (target as any)[prop];
      }
      // Return a resolved mock function for any dynamically defined Redis commands (like rate limit checks)
      return vi.fn().mockImplementation((...args) => {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          callback(null, [1, 1000]);
        }
        return Promise.resolve([1, 1000]);
      });
    },
  });
  
  return {
    RedisConnection: vi.fn().mockImplementation(() => {
      return {
        connect: vi.fn().mockResolvedValue(mockClient),
        getClient: vi.fn().mockReturnValue(mockClient),
        healthCheck: vi.fn().mockResolvedValue(true),
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { loadGatewayConfig } from '../../src/config/gateway-config';

// Load gateway config before building fastify app
process.env.NODE_ENV = 'testing';
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long';
loadGatewayConfig();

describe('Gateway Integration Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    const { createLogger } = await import('@ai-career-os/logger');
    const { buildApp } = await import('../../src/app');
    const logger = createLogger('gateway-test', { level: 'silent' });
    app = await buildApp(logger);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /health - Liveness Probe', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('gateway');
  });

  it('GET /health/ready - Readiness Probe (healthy Redis)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ready');
    expect(body.checks.redis).toBe('healthy');
  });

  it('GET /api/v1/profile/me - Unauthorized when token missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/profile/me',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Authorization header is missing');
  });

  it('GET /api/v1/profile/me - Invalid token validation', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/profile/me',
      headers: {
        authorization: 'Bearer invalid-token-signature',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('TOKEN_INVALID');
  });
});
