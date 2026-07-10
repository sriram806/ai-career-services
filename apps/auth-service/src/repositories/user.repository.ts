import { eq, and, isNull } from 'drizzle-orm';
import { users, credentials } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbUser {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  phone: string | null;
  university: string | null;
  country: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  termsAcceptedAt: Date | null;
  role: string;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  lastFailedLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date | null;
  deletedAt: Date | null;
}

export interface DbCredential {
  id: string;
  userId: string;
  passwordHash: string;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Repository for user and credential records.
 *
 * Design decisions:
 *   - Soft deletes via `deletedAt` — all queries filter on isNull(deletedAt)
 *   - Credentials are in a separate table to isolate sensitive data
 *   - Failed login tracking is on the user record for atomic lockout checks
 *   - All find methods return null on miss (no exceptions for not-found)
 */
export class UserRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findById(id: string): Promise<DbUser | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return (result[0] as DbUser) || null;
  }

  async findByEmail(email: string): Promise<DbUser | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt)))
      .limit(1);
    return (result[0] as DbUser) || null;
  }

  async findByUsername(username: string): Promise<DbUser | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.username, username.trim()), isNull(users.deletedAt)))
      .limit(1);
    return (result[0] as DbUser) || null;
  }

  async findByPhone(phone: string): Promise<DbUser | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone.trim()), isNull(users.deletedAt)))
      .limit(1);
    return (result[0] as DbUser) || null;
  }

  async createUser(data: {
    email: string;
    username: string;
    fullName?: string;
    phone?: string;
    university?: string;
    country?: string;
    termsAccepted?: boolean;
    role: string;
  }): Promise<DbUser> {
    const result = await this.db
      .insert(users)
      .values({
        email: data.email.toLowerCase().trim(),
        username: data.username.trim(),
        fullName: data.fullName || null,
        phone: data.phone || null,
        university: data.university || null,
        country: data.country || null,
        termsAcceptedAt: data.termsAccepted ? new Date() : null,
        role: data.role,
        status: 'pending_verification',
      })
      .returning();
    return result[0] as DbUser;
  }

  async updateUser(id: string, data: Partial<Omit<DbUser, 'id' | 'createdAt'>>): Promise<DbUser> {
    const result = await this.db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return result[0] as DbUser;
  }

  async softDeleteUser(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));
  }

  // ─── Credential Methods ─────────────────────────────

  async getCredentialsByUserId(userId: string): Promise<DbCredential | null> {
    const result = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);
    return (result[0] as DbCredential) || null;
  }

  async createCredentials(userId: string, passwordHash: string): Promise<DbCredential> {
    const result = await this.db
      .insert(credentials)
      .values({
        userId,
        passwordHash,
      })
      .returning();
    return result[0] as DbCredential;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(credentials)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(credentials.userId, userId));
  }

  // ─── Login Attempt Tracking ──────────────────────────

  /**
   * Atomically increments failed login counter and sets lockUntil if threshold reached.
   * Returns the updated user record for the caller to read the new state.
   */
  async incrementFailedAttempts(userId: string): Promise<DbUser> {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const newAttempts = user.failedLoginAttempts + 1;
    let lockUntil: Date | null = null;

    // Progressive lockout: 5 attempts → 30 min, 10 attempts → 24 hours
    if (newAttempts >= 10) {
      lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    } else if (newAttempts >= 5) {
      lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    return this.updateUser(userId, {
      failedLoginAttempts: newAttempts,
      lastFailedLogin: new Date(),
      lockUntil,
      status: lockUntil ? 'locked' : user.status,
    });
  }

  /**
   * Clears all failed login state after a successful authentication.
   */
  async clearFailedAttempts(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) return;

    // Only reset status if it was 'locked' — don't override 'suspended' or other states
    const newStatus = user.status === 'locked' ? 'active' : user.status;

    await this.updateUser(userId, {
      failedLoginAttempts: 0,
      lockUntil: null,
      lastFailedLogin: null,
      status: newStatus,
    });
  }

  /**
   * Admin unlock: clears lockout regardless of attempt count.
   */
  async adminUnlock(userId: string): Promise<void> {
    await this.updateUser(userId, {
      failedLoginAttempts: 0,
      lockUntil: null,
      lastFailedLogin: null,
      status: 'active',
    });
  }
}
