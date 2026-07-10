import { eq, and, gt } from 'drizzle-orm';
import { trustedDevices } from '@ai-career-os/database';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface DbTrustedDevice {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string | null;
  deviceNickname: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  lastUsedAt: Date;
  lastActiveAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for trusted device records.
 *
 * Device fingerprints are SHA-256 hashes of composite device signals
 * (User-Agent + IP subnet + optional client-side fingerprint).
 *
 * Trusted devices bypass future MFA challenges (when MFA is implemented).
 * They auto-expire after 30 days and can be revoked by the user.
 */
export class TrustedDeviceRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async createDevice(data: {
    userId: string;
    deviceFingerprint: string;
    deviceName: string | null;
    browser: string | null;
    os: string | null;
    ipAddress: string | null;
    expiresAt: Date;
  }): Promise<DbTrustedDevice> {
    const result = await this.db
      .insert(trustedDevices)
      .values({
        userId: data.userId,
        deviceFingerprint: data.deviceFingerprint,
        deviceName: data.deviceName,
        browser: data.browser,
        os: data.os,
        ipAddress: data.ipAddress,
        expiresAt: data.expiresAt,
      })
      .returning();
    return result[0] as DbTrustedDevice;
  }

  async findByFingerprint(userId: string, fingerprint: string): Promise<DbTrustedDevice | null> {
    const result = await this.db
      .select()
      .from(trustedDevices)
      .where(
        and(
          eq(trustedDevices.userId, userId),
          eq(trustedDevices.deviceFingerprint, fingerprint),
          gt(trustedDevices.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return (result[0] as DbTrustedDevice) || null;
  }

  async findAllForUser(userId: string): Promise<DbTrustedDevice[]> {
    return this.db
      .select()
      .from(trustedDevices)
      .where(
        and(
          eq(trustedDevices.userId, userId),
          gt(trustedDevices.expiresAt, new Date()),
        ),
      ) as Promise<DbTrustedDevice[]>;
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.db
      .update(trustedDevices)
      .set({ lastUsedAt: new Date() })
      .where(eq(trustedDevices.id, id));
  }

  async deleteDevice(id: string): Promise<void> {
    await this.db
      .delete(trustedDevices)
      .where(eq(trustedDevices.id, id));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.db
      .delete(trustedDevices)
      .where(eq(trustedDevices.userId, userId));
  }
}
