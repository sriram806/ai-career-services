import type { RbacRepository, DbRole, DbPermission } from '../repositories/rbac.repository';
import type { Redis } from 'ioredis';
import type { AuditRepository } from '../repositories/audit.repository';
import { ErrorFactory } from '@ai-career-os/errors';

export class RbacService {
  private readonly CACHE_TTL = 3600; // 1 hour

  private readonly DEFAULT_MATRIX: Record<string, string[]> = {
    candidate: ['career.read', 'exam.start', 'exam.submit', 'resume.upload'],
    mentor: ['career.read', 'resume.analyze'],
    recruiter: ['career.read', 'resume.analyze', 'notification.send'],
    hiring_manager: ['career.read', 'resume.analyze', 'notification.send'],
    organization_admin: ['career.read', 'career.write', 'resume.analyze', 'organization.manage', 'billing.manage', 'notification.send'],
    content_creator: ['career.read', 'career.write'],
    support_agent: ['career.read', 'notification.send'],
    platform_administrator: ['career.read', 'career.write', 'exam.start', 'exam.submit', 'resume.upload', 'resume.analyze', 'organization.manage', 'billing.manage', 'admin.manage', 'notification.send', 'analytics.read'],
    super_administrator: ['career.read', 'career.write', 'exam.start', 'exam.submit', 'resume.upload', 'resume.analyze', 'organization.manage', 'billing.manage', 'admin.manage', 'notification.send', 'analytics.read'],
  };

  constructor(
    private readonly rbacRepository: RbacRepository,
    private readonly auditRepository: AuditRepository,
    private readonly redisClient: Redis,
  ) {}

  /**
   * Seed default roles and permissions into database if they do not exist.
   */
  async seedRolesAndPermissions(): Promise<void> {
    const existingRoles = await this.rbacRepository.findAllRoles();
    if (existingRoles.length > 0) return; // Already seeded

    const permissionsMap: Record<string, DbPermission> = {};

    // 1. Create all unique permissions
    const allPermissions = Array.from(new Set(Object.values(this.DEFAULT_MATRIX).flat()));
    for (const permName of allPermissions) {
      permissionsMap[permName] = await this.rbacRepository.createPermission({
        name: permName,
        description: `Permission to perform ${permName}`,
      });
    }

    // 2. Create roles and link permissions
    for (const [roleName, rolePerms] of Object.entries(this.DEFAULT_MATRIX)) {
      const role = await this.rbacRepository.createRole({
        name: roleName,
        description: `Default role for ${roleName}`,
      });

      for (const permName of rolePerms) {
        const perm = permissionsMap[permName];
        if (perm) {
          await this.rbacRepository.assignPermissionToRole(role.id, perm.id);
        }
      }
    }
  }

  async getRoles(): Promise<DbRole[]> {
    return this.rbacRepository.findAllRoles();
  }

  async getPermissions(): Promise<DbPermission[]> {
    return this.rbacRepository.findAllPermissions();
  }

  /**
   * Fetches user permissions, caching in Redis for stateless performance.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `rbac:permissions:${userId}`;
    const cached = await this.redisClient.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const perms = await this.rbacRepository.findUserPermissions(userId);
    const permNames = perms.map((p) => p.name);

    await this.redisClient.set(cacheKey, JSON.stringify(permNames), 'EX', this.CACHE_TTL);
    return permNames;
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const cacheKey = `rbac:roles:${userId}`;
    const cached = await this.redisClient.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const userRoles = await this.rbacRepository.findUserRoles(userId);
    const roleNames = userRoles.map((r) => r.name);

    await this.redisClient.set(cacheKey, JSON.stringify(roleNames), 'EX', this.CACHE_TTL);
    return roleNames;
  }

  async assignRoleToUser(
    userId: string,
    roleName: string,
    operatorId?: string,
  ): Promise<void> {
    const role = await this.rbacRepository.findRoleByName(roleName);
    if (!role) {
      throw ErrorFactory.notFound('Role', roleName);
    }

    await this.rbacRepository.assignRoleToUser(userId, role.id);
    await this.clearUserRbacCache(userId);

    // Audit log
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'role.assigned',
      details: { roleName, assignedBy: operatorId || 'system' },
    });
  }

  async revokeRoleFromUser(
    userId: string,
    roleName: string,
    operatorId?: string,
  ): Promise<void> {
    const role = await this.rbacRepository.findRoleByName(roleName);
    if (!role) {
      throw ErrorFactory.notFound('Role', roleName);
    }

    await this.rbacRepository.removeRoleFromUser(userId, role.id);
    await this.clearUserRbacCache(userId);

    // Audit log
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'role.revoked',
      details: { roleName, revokedBy: operatorId || 'system' },
    });
  }

  private async clearUserRbacCache(userId: string): Promise<void> {
    await this.redisClient.del(`rbac:permissions:${userId}`);
    await this.redisClient.del(`rbac:roles:${userId}`);
  }
}
