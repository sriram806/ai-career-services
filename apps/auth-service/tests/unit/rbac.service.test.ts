import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RbacService } from '../../src/services/rbac.service';

describe('RbacService Unit Tests', () => {
  let mockRbacRepository: any;
  let mockAuditRepository: any;
  let mockRedisClient: any;
  let service: RbacService;
  let redisStore: Record<string, string>;

  beforeEach(() => {
    redisStore = {};
    mockRbacRepository = {
      findAllRoles: vi.fn().mockResolvedValue([{ id: 'r1', name: 'candidate' }]),
      findAllPermissions: vi.fn().mockResolvedValue([{ id: 'p1', name: 'career.read' }]),
      findRoleByName: vi.fn().mockResolvedValue({ id: 'r1', name: 'candidate' }),
      assignRoleToUser: vi.fn().mockResolvedValue(undefined),
      removeRoleFromUser: vi.fn().mockResolvedValue(undefined),
      findUserRoles: vi.fn().mockResolvedValue([{ id: 'r1', name: 'candidate' }]),
      findUserPermissions: vi.fn().mockResolvedValue([{ id: 'p1', name: 'career.read' }]),
    };

    mockAuditRepository = {
      createSecurityEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockRedisClient = {
      get: vi.fn().mockImplementation((key) => Promise.resolve(redisStore[key] || null)),
      set: vi.fn().mockImplementation((key, val) => {
        redisStore[key] = String(val);
        return Promise.resolve('OK');
      }),
      del: vi.fn().mockImplementation((key) => {
        delete redisStore[key];
        return Promise.resolve(1);
      }),
    };

    service = new RbacService(mockRbacRepository, mockAuditRepository, mockRedisClient);
  });

  it('should list all roles and permissions', async () => {
    const roles = await service.getRoles();
    const permissions = await service.getPermissions();

    expect(roles.length).toBe(1);
    expect(roles[0].name).toBe('candidate');
    expect(permissions.length).toBe(1);
    expect(permissions[0].name).toBe('career.read');
  });

  it('should fetch user roles and cache them in Redis', async () => {
    const userId = 'user-uuid';
    const roles1 = await service.getUserRoles(userId);
    expect(roles1).toEqual(['candidate']);
    expect(redisStore[`rbac:roles:${userId}`]).toBe(JSON.stringify(['candidate']));

    // Second call should hit Redis cache
    mockRbacRepository.findUserRoles.mockClear();
    const roles2 = await service.getUserRoles(userId);
    expect(roles2).toEqual(['candidate']);
    expect(mockRbacRepository.findUserRoles).not.toHaveBeenCalled();
  });

  it('should fetch user permissions and cache them in Redis', async () => {
    const userId = 'user-uuid';
    const perms1 = await service.getUserPermissions(userId);
    expect(perms1).toEqual(['career.read']);
    expect(redisStore[`rbac:permissions:${userId}`]).toBe(JSON.stringify(['career.read']));

    // Second call should hit Redis cache
    mockRbacRepository.findUserPermissions.mockClear();
    const perms2 = await service.getUserPermissions(userId);
    expect(perms2).toEqual(['career.read']);
    expect(mockRbacRepository.findUserPermissions).not.toHaveBeenCalled();
  });

  it('should assign a role to user and invalidate the cache', async () => {
    const userId = 'user-uuid';
    redisStore[`rbac:roles:${userId}`] = JSON.stringify(['candidate']);

    await service.assignRoleToUser(userId, 'candidate', 'admin-uuid');

    expect(mockRbacRepository.assignRoleToUser).toHaveBeenCalledWith(userId, 'r1');
    expect(redisStore[`rbac:roles:${userId}`]).toBeUndefined(); // Invalided
    expect(mockAuditRepository.createSecurityEvent).toHaveBeenCalled();
  });

  it('should revoke a role from user and invalidate the cache', async () => {
    const userId = 'user-uuid';
    redisStore[`rbac:roles:${userId}`] = JSON.stringify(['candidate']);

    await service.revokeRoleFromUser(userId, 'candidate', 'admin-uuid');

    expect(mockRbacRepository.removeRoleFromUser).toHaveBeenCalledWith(userId, 'r1');
    expect(redisStore[`rbac:roles:${userId}`]).toBeUndefined(); // Invalided
    expect(mockAuditRepository.createSecurityEvent).toHaveBeenCalled();
  });
});
