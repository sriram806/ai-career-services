import { eq } from 'drizzle-orm';
import { passwordResetTokens } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Repository for password reset tokens.
 *
 * Security properties:
 *   - Tokens are cryptographically random (48 bytes / 96 hex chars)
 *   - Only SHA-256 hash is stored; plaintext sent via email
 *   - Single-use: `usedAt` is set immediately on successful reset
 *   - 15-minute expiry window (OWASP ASVS §2.1.6)
 *   - All tokens invalidated for a user when a new reset is requested
 */
export class PasswordResetRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<DbPasswordResetToken> {
    const result = await this.db
      .insert(passwordResetTokens)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning();
    return result[0] as DbPasswordResetToken;
  }

  async findByTokenHash(tokenHash: string): Promise<DbPasswordResetToken | null> {
    const result = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return (result[0] as DbPasswordResetToken) || null;
  }

  async markUsed(id: string): Promise<void> {
    await this.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
  }
}
