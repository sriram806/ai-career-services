import { eq, and } from 'drizzle-orm';
import { passkeys } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbPasskey {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string | null;
  backedUp: boolean;
  nickname: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export class PasskeyRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createPasskey(data: {
    userId: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    transports: string[];
    deviceType?: string;
    backedUp?: boolean;
    nickname?: string;
  }): Promise<DbPasskey> {
    const result = await this.db
      .insert(passkeys)
      .values({
        userId: data.userId,
        credentialId: data.credentialId,
        publicKey: data.publicKey,
        counter: data.counter,
        transports: data.transports,
        deviceType: data.deviceType || null,
        backedUp: data.backedUp ?? false,
        nickname: data.nickname || null,
      })
      .returning();
    return result[0] as unknown as DbPasskey;
  }

  async findById(id: string): Promise<DbPasskey | null> {
    const result = await this.db
      .select()
      .from(passkeys)
      .where(eq(passkeys.id, id))
      .limit(1);
    return (result[0] as unknown as DbPasskey) || null;
  }

  async findByCredentialId(credentialId: string): Promise<DbPasskey | null> {
    const result = await this.db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, credentialId))
      .limit(1);
    return (result[0] as unknown as DbPasskey) || null;
  }

  async findAllForUser(userId: string): Promise<DbPasskey[]> {
    return this.db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, userId)) as unknown as Promise<DbPasskey[]>;
  }

  async updateCounter(id: string, counter: number): Promise<void> {
    await this.db
      .update(passkeys)
      .set({
        counter,
        lastUsedAt: new Date(),
      })
      .where(eq(passkeys.id, id));
  }

  async updateNickname(id: string, userId: string, nickname: string): Promise<void> {
    await this.db
      .update(passkeys)
      .set({ nickname })
      .where(
        and(
          eq(passkeys.id, id),
          eq(passkeys.userId, userId),
        ),
      );
  }

  async deletePasskey(id: string, userId: string): Promise<void> {
    await this.db
      .delete(passkeys)
      .where(
        and(
          eq(passkeys.id, id),
          eq(passkeys.userId, userId),
        ),
      );
  }
}
