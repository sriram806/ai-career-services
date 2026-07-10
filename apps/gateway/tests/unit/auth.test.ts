import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { isPublicRoute, authenticateRequest } from '../../src/middlewares/auth';
import { loadGatewayConfig } from '../../src/config/gateway-config';

// Initialize configuration for tests
process.env.NODE_ENV = 'testing';
process.env.JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long';
loadGatewayConfig();

describe('Auth Middleware', () => {
  describe('isPublicRoute', () => {
    it('should identify public routes correctly', () => {
      expect(isPublicRoute('/health')).toBe(true);
      expect(isPublicRoute('/health/ready')).toBe(true);
      expect(isPublicRoute('/docs')).toBe(true);
      expect(isPublicRoute('/api/v1/auth/login')).toBe(true);
      expect(isPublicRoute('/api/v1/auth/register')).toBe(true);
      expect(isPublicRoute('/api/v1/auth/refresh')).toBe(true);
    });

    it('should identify private routes correctly', () => {
      expect(isPublicRoute('/api/v1/profile/me')).toBe(false);
      expect(isPublicRoute('/api/v1/ai/analyze')).toBe(false);
      expect(isPublicRoute('/api/v1/auth/logout')).toBe(false);
    });
  });

  describe('authenticateRequest', () => {
    it('should skip authentication on public routes', async () => {
      const mockReq = { url: '/health' } as any;
      await expect(authenticateRequest(mockReq, {} as any)).resolves.not.toThrow();
      expect(mockReq.user).toBeUndefined();
    });

    it('should throw unauthorized error when authorization header is missing', async () => {
      const mockReq = { url: '/api/v1/profile/me', headers: {} } as any;
      await expect(authenticateRequest(mockReq, {} as any)).rejects.toThrowError(
        /Authorization header is missing/,
      );
    });

    it('should throw unauthorized error for invalid header format', async () => {
      const mockReq = {
        url: '/api/v1/profile/me',
        headers: { authorization: 'Basic abcde12345' },
      } as any;
      await expect(authenticateRequest(mockReq, {} as any)).rejects.toThrowError(
        /Invalid authorization header format/,
      );
    });

    it('should verify token and attach user context to request', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        roles: ['student'],
        sessionId: 'session-456',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET!);

      const mockReq = {
        url: '/api/v1/profile/me',
        headers: { authorization: `Bearer ${token}` },
      } as any;

      await authenticateRequest(mockReq, {} as any);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe('user-123');
      expect(mockReq.user?.email).toBe('test@example.com');
      expect(mockReq.user?.roles).toContain('student');
    });

    it('should throw expired error for expired tokens', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        roles: ['student'],
        sessionId: 'session-456',
        iat: Math.floor(Date.now() / 1000) - 120,
        exp: Math.floor(Date.now() / 1000) - 60,
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET!);

      const mockReq = {
        url: '/api/v1/profile/me',
        headers: { authorization: `Bearer ${token}` },
      } as any;

      await expect(authenticateRequest(mockReq, {} as any)).rejects.toThrowError(
        /Token has expired/,
      );
    });
  });
});
