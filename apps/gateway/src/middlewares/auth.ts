import jwt from 'jsonwebtoken';
import { ErrorFactory } from '@ai-career-os/errors';
import { getGatewayConfig } from '../config/gateway-config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TokenPayload, AuthenticatedUser } from '@ai-career-os/types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

const PUBLIC_PREFIXES = [
  '/health',
  '/docs',
  '/swagger',
  '/openapi.json',
];

const PUBLIC_EXACT_ROUTES = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/verify-email',
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
  '/auth/mfa/verify',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
];

/**
 * Checks if a given request URL is a configured public route.
 */
export function isPublicRoute(url: string): boolean {
  // Strip query parameters
  const pathname = url.split('?')[0] || '/';
  
  if (PUBLIC_EXACT_ROUTES.includes(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Fastify preHandler hook for JWT token verification.
 * Extracts Bearer token, verifies its signature and expiration, and attaches user context.
 */
export async function authenticateRequest(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  // Skip authentication for public routes
  if (isPublicRoute(request.url)) {
    return;
  }

  const authHeader = request.headers['authorization'];
  if (!authHeader) {
    throw ErrorFactory.unauthorized('Authorization header is missing');
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ErrorFactory.unauthorized('Invalid authorization header format. Use Bearer <token>');
  }

  const config = getGatewayConfig();
  const secretOrKey = config.JWT_PUBLIC_KEY || config.JWT_SECRET;

  try {
    const decoded = jwt.verify(token, secretOrKey) as TokenPayload;

    // Attach mapped user context to request
    request.user = {
      userId: decoded.sub,
      email: decoded.email,
      roles: decoded.roles,
      organizationId: decoded.organizationId,
      sessionId: decoded.sessionId,
    };
  } catch (err: any) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ErrorFactory.tokenExpired();
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw ErrorFactory.tokenInvalid();
    }
    throw ErrorFactory.unauthorized('Authentication failed');
  }
}
