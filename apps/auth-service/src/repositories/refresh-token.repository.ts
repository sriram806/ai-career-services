import { eq, or } from 'drizzle-orm';
import { refreshTokens } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbRefreshToken {
  id: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  parentTokenHash: string | null;
  isUsed: boolean;
  isRevoked: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export class RefreshTokenRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createRefreshToken(data: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    parentTokenHash: string | null;
    expiresAt: Date;
  }): Promise<DbRefreshToken> {
    const result = await this.db
      .insert(refreshTokens)
      .values({
        userId: data.userId,
        sessionId: data.sessionId,
        tokenHash: data.tokenHash,
        parentTokenHash: data.parentTokenHash,
        expiresAt: data.expiresAt,
        isUsed: false,
        isRevoked: false,
      })
      .returning();
    return result[0]!;
  }

  async findByTokenHash(tokenHash: string): Promise<DbRefreshToken | null> {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return result[0] || null;
  }

  async markUsed(tokenHash: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isUsed: true })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async revokeToken(tokenHash: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  async revokeFamily(parentTokenHash: string): Promise<void> {
    // Revoke the parent token and all child tokens descended from it
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(
        or(
          eq(refreshTokens.tokenHash, parentTokenHash),
          eq(refreshTokens.parentTokenHash, parentTokenHash),
        ),
      );
  }
}
