import { eq, and, desc } from 'drizzle-orm';
import { otpCodes } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbOtpCode {
  id: string;
  userId: string;
  codeHash: string;
  purpose: string;
  attempts: number;
  isUsed: boolean;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Repository for OTP code persistence in PostgreSQL.
 * Acts as the durable backup for Redis-cached OTPs.
 */
export class OtpRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createOtpCode(data: {
    userId: string;
    codeHash: string;
    purpose: string;
    expiresAt: Date;
  }): Promise<DbOtpCode> {
    const result = await this.db
      .insert(otpCodes)
      .values({
        userId: data.userId,
        codeHash: data.codeHash,
        purpose: data.purpose,
        expiresAt: data.expiresAt,
        attempts: 0,
        isUsed: false,
      })
      .returning();
    return result[0] as DbOtpCode;
  }

  async findLatestActiveCode(userId: string, purpose: string): Promise<DbOtpCode | null> {
    const result = await this.db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.userId, userId), eq(otpCodes.purpose, purpose)))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    return (result[0] as DbOtpCode) || null;
  }

  async incrementAttempts(id: string): Promise<void> {
    const result = await this.db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.id, id))
      .limit(1);

    if (result[0]) {
      await this.db
        .update(otpCodes)
        .set({ attempts: result[0].attempts + 1 })
        .where(eq(otpCodes.id, id));
    }
  }

  async deleteOtpCode(id: string): Promise<void> {
    await this.db.delete(otpCodes).where(eq(otpCodes.id, id));
  }

  async deleteAllUserOtpCodes(userId: string, purpose: string): Promise<void> {
    await this.db
      .delete(otpCodes)
      .where(and(eq(otpCodes.userId, userId), eq(otpCodes.purpose, purpose)));
  }
}
