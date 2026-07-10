import { eq, desc } from 'drizzle-orm';
import { passwordHistory } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Repository for password history records.
 * Used to enforce the "no previous N passwords" reuse policy (OWASP ASVS §2.1.10).
 *
 * Only stores Argon2id hashes — original passwords are never recoverable.
 * Each password change creates a new history entry; the service layer enforces
 * the comparison against the last N entries before allowing a change.
 */
export class PasswordHistoryRepository {
  constructor(private readonly db: NodePgDatabase) {}

  /**
   * Records a new password hash in the history.
   */
  async addEntry(userId: string, hash: string): Promise<void> {
    await this.db.insert(passwordHistory).values({
      userId,
      passwordHash: hash,
    });
  }

  /**
   * Retrieves the most recent N password hashes for a user.
   * Ordered newest-first so callers can compare against the limit.
   */
  async getRecentHashes(userId: string, limit: number = 5): Promise<string[]> {
    const rows = await this.db
      .select({ passwordHash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(limit);

    return rows.map((r) => r.passwordHash);
  }
}
