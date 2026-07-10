import { eq } from 'drizzle-orm';
import { mfaSettings, recoveryCodes } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbMfaSettings {
  id: string;
  userId: string;
  emailEnabled: boolean;
  totpEnabled: boolean;
  totpSecret: string | null;
  smsEnabled: boolean;
  smsPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbRecoveryCode {
  id: string;
  userId: string;
  codeHash: string;
  isUsed: boolean;
  usedAt: Date | null;
  createdAt: Date;
}

export class MfaRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findByUserId(userId: string): Promise<DbMfaSettings | null> {
    const result = await this.db
      .select()
      .from(mfaSettings)
      .where(eq(mfaSettings.userId, userId))
      .limit(1);
    return (result[0] as DbMfaSettings) || null;
  }

  async upsertSettings(data: {
    userId: string;
    emailEnabled?: boolean;
    totpEnabled?: boolean;
    totpSecret?: string | null;
    smsEnabled?: boolean;
    smsPhone?: string | null;
  }): Promise<DbMfaSettings> {
    const existing = await this.findByUserId(data.userId);

    if (existing) {
      const result = await this.db
        .update(mfaSettings)
        .set({
          emailEnabled: data.emailEnabled ?? existing.emailEnabled,
          totpEnabled: data.totpEnabled ?? existing.totpEnabled,
          totpSecret: data.totpSecret !== undefined ? data.totpSecret : existing.totpSecret,
          smsEnabled: data.smsEnabled ?? existing.smsEnabled,
          smsPhone: data.smsPhone !== undefined ? data.smsPhone : existing.smsPhone,
          updatedAt: new Date(),
        })
        .where(eq(mfaSettings.userId, data.userId))
        .returning();
      return result[0] as DbMfaSettings;
    } else {
      const result = await this.db
        .insert(mfaSettings)
        .values({
          userId: data.userId,
          emailEnabled: data.emailEnabled ?? false,
          totpEnabled: data.totpEnabled ?? false,
          totpSecret: data.totpSecret ?? null,
          smsEnabled: data.smsEnabled ?? false,
          smsPhone: data.smsPhone ?? null,
        })
        .returning();
      return result[0] as DbMfaSettings;
    }
  }

  async saveRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    // Delete existing codes first
    await this.deleteRecoveryCodes(userId);

    if (codeHashes.length === 0) return;

    await this.db.insert(recoveryCodes).values(
      codeHashes.map((hash) => ({
        userId,
        codeHash: hash,
        isUsed: false,
      })),
    );
  }

  async findRecoveryCodesByUserId(userId: string): Promise<DbRecoveryCode[]> {
    return this.db
      .select()
      .from(recoveryCodes)
      .where(eq(recoveryCodes.userId, userId)) as Promise<DbRecoveryCode[]>;
  }

  async markRecoveryCodeUsed(id: string): Promise<void> {
    await this.db
      .update(recoveryCodes)
      .set({
        isUsed: true,
        usedAt: new Date(),
      })
      .where(eq(recoveryCodes.id, id));
  }

  async deleteRecoveryCodes(userId: string): Promise<void> {
    await this.db
      .delete(recoveryCodes)
      .where(eq(recoveryCodes.userId, userId));
  }
}
