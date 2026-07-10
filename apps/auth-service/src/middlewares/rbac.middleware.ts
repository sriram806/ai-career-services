import type { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorFactory } from '@ai-career-os/errors';

/**
 * Fastify preHandler hook to require a specific permission.
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user) {
      throw ErrorFactory.unauthorized('Authentication required');
    }

    const permissions: string[] = user.permissions || [];
    if (!permissions.includes(permission)) {
      throw ErrorFactory.forbidden(`Insufficient permissions. Required permission: ${permission}`);
    }
  };
}

/**
 * Fastify preHandler hook to require at least one of the specified permissions.
 */
export function requireAnyPermission(requiredPermissions: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = (request as any).user;
    if (!user) {
      throw ErrorFactory.unauthorized('Authentication required');
    }

    const permissions: string[] = user.permissions || [];
    const hasAny = requiredPermissions.some((p) => permissions.includes(p));
    if (!hasAny) {
      throw ErrorFactory.forbidden(
        `Insufficient permissions. Required one of: ${requiredPermissions.join(', ')}`,
      );
    }
  };
}
