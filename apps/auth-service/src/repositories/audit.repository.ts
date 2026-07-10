import { eq, desc } from 'drizzle-orm';
import { loginHistory, securityEvents } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export class AuditRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createLoginHistory(data: {
    userId: string | null;
    email: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    status: string; // 'success' | 'failed'
    failureReason: string | null;
  }): Promise<void> {
    await this.db.insert(loginHistory).values({
      userId: data.userId,
      email: data.email,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      status: data.status,
      failureReason: data.failureReason,
    });
  }

  async createSecurityEvent(data: {
    userId: string | null;
    eventType: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    details: Record<string, any>;
  }): Promise<void> {
    await this.db.insert(securityEvents).values({
      userId: data.userId,
      eventType: data.eventType,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      details: data.details,
    });
  }

  async findSecurityEventsForUser(userId: string): Promise<any[]> {
    return this.db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, userId))
      .orderBy(desc(securityEvents.createdAt));
  }
}
