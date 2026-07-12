import { eq, and, ne, asc, desc, count } from 'drizzle-orm';
import { sessions } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbSession {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  location: string | null;
  refreshTokenHash: string;
  isActive: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Repository for session persistence.
 *
 * Sessions are the server-side anchor for refresh tokens. Each active session
 * represents a logged-in device. The service layer enforces the max-5-sessions
 * policy by calling countActiveSessions() before creation.
 *
 * Sessions are never deleted — they're marked inactive with a revokedAt timestamp
 * for audit trail compliance.
 */
export class SessionRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createSession(data: {
    userId: string;
    userAgent: string | null;
    ipAddress: string | null;
    deviceName: string | null;
    browser: string | null;
    os: string | null;
    location: string | null;
    refreshTokenHash: string;
    expiresAt: Date;
  }): Promise<DbSession> {
    const result = await this.db
      .insert(sessions)
      .values({
        userId: data.userId,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        deviceName: data.deviceName,
        browser: data.browser,
        os: data.os,
        location: data.location,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        isActive: true,
      })
      .returning();
    return result[0] as DbSession;
  }

  async findById(id: string): Promise<DbSession | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    return (result[0] as DbSession) || null;
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<DbSession | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return (result[0] as DbSession) || null;
  }

  async revokeSession(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        isActive: false,
        revokedAt: new Date(),
      })
      .where(eq(sessions.id, id));
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        isActive: false,
        revokedAt: new Date(),
      })
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)));
  }

  async revokeAllOtherUserSessions(userId: string, activeSessionId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        isActive: false,
        revokedAt: new Date(),
      })
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.id, activeSessionId),
          eq(sessions.isActive, true),
        ),
      );
  }

  async findActiveSessionsByUserId(userId: string): Promise<DbSession[]> {
    return this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)))
      .orderBy(desc(sessions.lastActivityAt))
      .limit(5) as Promise<DbSession[]>;
  }

  /**
   * Returns the count of currently active sessions for a user.
   * Used by the session service to enforce the max-sessions policy.
   */
  async countActiveSessions(userId: string): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)));
    return result[0]?.value ?? 0;
  }

  /**
   * Finds the oldest active session for a user (by createdAt ASC).
   * Used by the max-sessions eviction policy.
   */
  async findOldestActiveSession(userId: string): Promise<DbSession | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.isActive, true)))
      .orderBy(asc(sessions.createdAt))
      .limit(1);
    return (result[0] as DbSession) || null;
  }

  async updateSessionRefreshTokenHash(id: string, refreshTokenHash: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ refreshTokenHash })
      .where(eq(sessions.id, id));
  }

  async updateLastActivity(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessions.id, id));
  }
}
