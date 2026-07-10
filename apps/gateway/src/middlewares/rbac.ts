import { ErrorFactory } from '@ai-career-os/errors';
import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Higher-order middleware to enforce Role-Based Access Control (RBAC).
 *
 * Checks if the authenticated user has at least one of the required roles.
 *
 * Allowed roles correspond to:
 * - Candidate (typically 'student' or 'candidate')
 * - Mentor (typically 'professional' or 'mentor')
 * - Manager (typically 'professional' or 'manager')
 * - Recruiter (typically 'recruiter')
 * - Organization Admin (typically 'organization_admin')
 * - Platform Administrator (typically 'platform_admin' or 'super_admin')
 */
export function authorizeRoles(allowedRoles: string[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    // If route is public, user context might be empty
    if (!request.user) {
      throw ErrorFactory.unauthorized('Authentication context is missing');
    }

    const userRoles = request.user.roles;
    const isAuthorized = userRoles.some((role) =>
      allowedRoles.some(
        (allowed) => allowed.toLowerCase() === role.toLowerCase(),
      ),
    );

    if (!isAuthorized) {
      throw ErrorFactory.insufficientPermissions(allowedRoles.join(' or '));
    }
  };
}
