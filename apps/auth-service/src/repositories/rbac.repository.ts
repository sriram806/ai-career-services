import { eq, and, inArray } from 'drizzle-orm';
import { roles, permissions, rolePermissions, userRoles } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbRole {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbPermission {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class RbacRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findAllRoles(): Promise<DbRole[]> {
    return this.db.select().from(roles) as Promise<DbRole[]>;
  }

  async findAllPermissions(): Promise<DbPermission[]> {
    return this.db.select().from(permissions) as Promise<DbPermission[]>;
  }

  async findRoleByName(name: string): Promise<DbRole | null> {
    const result = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, name))
      .limit(1);
    return (result[0] as DbRole) || null;
  }

  async findPermissionByName(name: string): Promise<DbPermission | null> {
    const result = await this.db
      .select()
      .from(permissions)
      .where(eq(permissions.name, name))
      .limit(1);
    return (result[0] as DbPermission) || null;
  }

  async createRole(data: { name: string; description?: string }): Promise<DbRole> {
    const result = await this.db
      .insert(roles)
      .values({
        name: data.name,
        description: data.description || null,
      })
      .returning();
    return result[0] as DbRole;
  }

  async createPermission(data: { name: string; description?: string }): Promise<DbPermission> {
    const result = await this.db
      .insert(permissions)
      .values({
        name: data.name,
        description: data.description || null,
      })
      .returning();
    return result[0] as DbPermission;
  }

  async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    await this.db
      .insert(rolePermissions)
      .values({
        roleId,
        permissionId,
      })
      .onConflictDoNothing();
  }

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    await this.db
      .insert(userRoles)
      .values({
        userId,
        roleId,
      })
      .onConflictDoNothing();
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await this.db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
        ),
      );
  }

  async findUserRoles(userId: string): Promise<DbRole[]> {
    const userRoleIds = await this.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    if (userRoleIds.length === 0) return [];

    const ids = userRoleIds.map((ur) => ur.roleId);
    return this.db
      .select()
      .from(roles)
      .where(inArray(roles.id, ids)) as Promise<DbRole[]>;
  }

  async findUserPermissions(userId: string): Promise<DbPermission[]> {
    // 1. Get user roles
    const userRoleIds = await this.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    if (userRoleIds.length === 0) return [];

    const ids = userRoleIds.map((ur) => ur.roleId);

    // 2. Get permission IDs for those roles
    const permIdsResult = await this.db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleId, ids));

    if (permIdsResult.length === 0) return [];

    const pIds = permIdsResult.map((pr) => pr.permissionId);

    // 3. Get permissions
    return this.db
      .select()
      .from(permissions)
      .where(inArray(permissions.id, pIds)) as Promise<DbPermission[]>;
  }
}
