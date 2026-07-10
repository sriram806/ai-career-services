import { eq, and } from 'drizzle-orm';
import { oauthAccounts, connectedAccounts } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbOAuthAccount {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  providerEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbConnectedAccount {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  providerEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class OAuthRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createOAuthAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    providerEmail?: string;
  }): Promise<DbOAuthAccount> {
    const result = await this.db
      .insert(oauthAccounts)
      .values({
        userId: data.userId,
        provider: data.provider,
        providerUserId: data.providerUserId,
        providerEmail: data.providerEmail || null,
      })
      .returning();
    return result[0] as DbOAuthAccount;
  }

  async findOAuthAccount(provider: string, providerUserId: string): Promise<DbOAuthAccount | null> {
    const result = await this.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    return (result[0] as DbOAuthAccount) || null;
  }

  async findOAuthAccountsByUserId(userId: string): Promise<DbOAuthAccount[]> {
    return this.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId)) as Promise<DbOAuthAccount[]>;
  }

  async deleteOAuthAccount(userId: string, provider: string): Promise<void> {
    await this.db
      .delete(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.userId, userId),
          eq(oauthAccounts.provider, provider),
        ),
      );
  }

  async createConnectedAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    providerEmail?: string;
  }): Promise<DbConnectedAccount> {
    const result = await this.db
      .insert(connectedAccounts)
      .values({
        userId: data.userId,
        provider: data.provider,
        providerUserId: data.providerUserId,
        providerEmail: data.providerEmail || null,
      })
      .returning();
    return result[0] as DbConnectedAccount;
  }

  async findConnectedAccountsByUserId(userId: string): Promise<DbConnectedAccount[]> {
    return this.db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.userId, userId)) as Promise<DbConnectedAccount[]>;
  }

  async deleteConnectedAccount(userId: string, provider: string): Promise<void> {
    await this.db
      .delete(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.userId, userId),
          eq(connectedAccounts.provider, provider),
        ),
      );
  }
}
