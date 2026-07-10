import { eq } from 'drizzle-orm';
import { emailVerificationTokens } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbEmailVerificationToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Repository for email verification tokens.
 *
 * Token lifecycle:
 *   1. Registration → generateToken() → plaintext sent to user, SHA-256 hash stored here
 *   2. User clicks link/submits token → findByTokenHash() → validate expiry + unused → markUsed()
 *   3. On resend → invalidateAllForUser() → generateToken() again
 *
 * Security invariants:
 *   - Plaintext tokens are NEVER stored
 *   - Tokens are single-use (usedAt is set on verification)
 *   - 24-hour expiry window
 */
export class EmailVerificationRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<DbEmailVerificationToken> {
    const result = await this.db
      .insert(emailVerificationTokens)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning();
    return result[0] as DbEmailVerificationToken;
  }

  async findByTokenHash(tokenHash: string): Promise<DbEmailVerificationToken | null> {
    const result = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);
    return (result[0] as DbEmailVerificationToken) || null;
  }

  async markUsed(id: string): Promise<void> {
    await this.db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, id));
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    await this.db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }
}
