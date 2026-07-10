import { eq, desc } from 'drizzle-orm';
import { loginAttempts } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbLoginAttempt {
  id: string;
  userId: string | null;
  email: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  failureReason: string | null;
  attemptNumber: number | null;
  createdAt: Date;
}

/**
 * Repository for login attempt records.
 *
 * Records every authentication attempt (success or failure) with full context.
 * Used for:
 *   - Security analytics and anomaly detection
 *   - Progressive lockout policy enforcement
 *   - SOC 2 / ISO 27001 compliance audit trail
 *
 * This table is append-only — records are never updated or deleted.
 */
export class LoginAttemptRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createAttempt(data: {
    userId: string | null;
    email: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    status: string;
    failureReason: string | null;
    attemptNumber: number | null;
  }): Promise<void> {
    await this.db.insert(loginAttempts).values({
      userId: data.userId,
      email: data.email,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      status: data.status,
      failureReason: data.failureReason,
      attemptNumber: data.attemptNumber,
    });
  }

  async getRecentAttemptsByEmail(email: string, limit: number = 20): Promise<DbLoginAttempt[]> {
    return this.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, email))
      .orderBy(desc(loginAttempts.createdAt))
      .limit(limit) as Promise<DbLoginAttempt[]>;
  }
}
