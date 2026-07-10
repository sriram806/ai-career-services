import * as crypto from 'node:crypto';
import type { TrustedDeviceRepository, DbTrustedDevice } from '../repositories/trusted-device.repository';
import type { AuditRepository } from '../repositories/audit.repository';

export interface DeviceInfo {
  deviceName: string;
  browser: string;
  os: string;
}

/**
 * Trusted Device Service.
 *
 * Manages device fingerprinting and trust for "Remember this device" functionality.
 * When a device is trusted, it bypasses future MFA challenges (when MFA is enabled).
 *
 * Fingerprint generation:
 *   Currently uses SHA-256 of (userId + userAgent + IP subnet).
 *   In production, this would be augmented with client-side fingerprinting
 *   (canvas fingerprint, WebGL renderer, etc.) sent as a header.
 *
 * Trust lifecycle:
 *   1. User logs in from unknown device → optional "Trust this device?" prompt
 *   2. User trusts → device registered with 30-day TTL
 *   3. On subsequent logins → fingerprint matched → MFA skipped
 *   4. After 30 days → trust expires → MFA required again
 *   5. User can revoke trust from "Active Devices" UI
 */
export class TrustedDeviceService {
  private readonly trustDurationDays = 30;

  constructor(
    public readonly trustedDeviceRepository: TrustedDeviceRepository,
    private readonly auditRepository: AuditRepository,
  ) {}

  /**
   * Generates a deterministic device fingerprint from available signals.
   * Uses SHA-256 to create a fixed-length, privacy-preserving identifier.
   */
  generateFingerprint(userId: string, userAgent: string | null, ipAddress: string | null): string {
    // Use IP subnet (first 3 octets) to be resilient to DHCP reassignment
    const ipSubnet = ipAddress ? ipAddress.split('.').slice(0, 3).join('.') : 'unknown';
    const raw = `${userId}:${userAgent || 'unknown'}:${ipSubnet}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Checks if the current device is already trusted for this user.
   */
  async isDeviceTrusted(userId: string, userAgent: string | null, ipAddress: string | null): Promise<boolean> {
    const fingerprint = this.generateFingerprint(userId, userAgent, ipAddress);
    const device = await this.trustedDeviceRepository.findByFingerprint(userId, fingerprint);

    if (device) {
      // Update last used timestamp
      await this.trustedDeviceRepository.updateLastUsed(device.id);
      return true;
    }

    return false;
  }

  /**
   * Registers the current device as trusted.
   * Returns the device record for reference.
   */
  async trustDevice(
    userId: string,
    userAgent: string | null,
    ipAddress: string | null,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<DbTrustedDevice> {
    const fingerprint = this.generateFingerprint(userId, userAgent, ipAddress);
    const { deviceName, browser, os } = this.parseUserAgent(userAgent);

    // Check if already trusted — update last used instead of creating duplicate
    const existing = await this.trustedDeviceRepository.findByFingerprint(userId, fingerprint);
    if (existing) {
      await this.trustedDeviceRepository.updateLastUsed(existing.id);
      return existing;
    }

    const expiresAt = new Date(Date.now() + this.trustDurationDays * 24 * 60 * 60 * 1000);

    const device = await this.trustedDeviceRepository.createDevice({
      userId,
      deviceFingerprint: fingerprint,
      deviceName,
      browser,
      os,
      ipAddress,
      expiresAt,
    });

    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'device.trusted',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: { deviceName, browser, os, fingerprint: fingerprint.substring(0, 12) + '...' },
    });

    return device;
  }

  /**
   * Checks if the current login is from a new/unknown device.
   * Returns true if the device has never been seen before.
   */
  async isNewDevice(userId: string, userAgent: string | null, ipAddress: string | null): Promise<boolean> {
    const fingerprint = this.generateFingerprint(userId, userAgent, ipAddress);
    const device = await this.trustedDeviceRepository.findByFingerprint(userId, fingerprint);
    return !device;
  }

  /**
   * Lists all trusted devices for a user.
   */
  async getUserDevices(userId: string): Promise<DbTrustedDevice[]> {
    return this.trustedDeviceRepository.findAllForUser(userId);
  }

  /**
   * Revokes trust for a specific device.
   */
  async revokeDevice(deviceId: string, userId: string): Promise<void> {
    await this.trustedDeviceRepository.deleteDevice(deviceId);
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'device.trust_revoked',
      ipAddress: null,
      userAgent: null,
      details: { deviceId },
    });
  }

  /**
   * Revokes trust for all devices (e.g., on password change).
   */
  async revokeAllDevices(userId: string): Promise<void> {
    await this.trustedDeviceRepository.deleteAllForUser(userId);
  }

  /**
   * Parses User-Agent header to extract device metadata.
   */
  private parseUserAgent(userAgent: string | null): DeviceInfo {
    if (!userAgent) {
      return { deviceName: 'Unknown Device', browser: 'Unknown Browser', os: 'Unknown OS' };
    }

    let os = 'Unknown OS';
    let browser = 'Unknown Browser';
    let deviceName = 'Desktop';

    if (/Windows/i.test(userAgent)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(userAgent)) os = 'macOS';
    else if (/Linux/i.test(userAgent)) os = 'Linux';
    else if (/Android/i.test(userAgent)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(userAgent)) os = 'iOS';

    if (/Chrome/i.test(userAgent) && !/Edge|Chrome\-Lighthouse/i.test(userAgent)) browser = 'Chrome';
    else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Edg/i.test(userAgent)) browser = 'Edge';

    if (/Mobile|Android|iPhone|iPod/i.test(userAgent)) {
      deviceName = /iPad/i.test(userAgent) ? 'Tablet' : 'Mobile';
    }

    return { deviceName, browser, os };
  }
}
