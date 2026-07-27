import { ErrorFactory } from '@ai-career-os/errors';

import type { EmailService } from './email.service';
import type { AuditRepository } from '../repositories/audit.repository';
import type { MfaRepository } from '../repositories/mfa.repository';
import type { OAuthRepository } from '../repositories/oauth.repository';
import type { SessionRepository } from '../repositories/session.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { Redis } from 'ioredis';

/**
 * DataExportService
 *
 * Implements DPDP Act data-portability right: when a user requests their data,
 * this service:
 *   1. Enforces a 24-hour rate limit per user via Redis
 *   2. Fetches all data the platform holds about them across all repositories
 *   3. Assembles a sanitized JSON archive (no password hashes, no internal tokens)
 *   4. Sends it as an email attachment to their registered email address
 *
 * Security decisions:
 *   - Password hashes, MFA secrets, and refresh token hashes are NEVER included
 *   - IP addresses in session history are included (they are the user's own data)
 *   - The export is sent only to the user's verified registered email
 *   - Every export request is recorded as a security event for audit trail
 */
export class DataExportService {
  private readonly EXPORT_COOLDOWN_SECONDS = 86400; // 24 hours

  constructor(
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly mfaRepository: MfaRepository,
    private readonly oauthRepository: OAuthRepository,
    private readonly auditRepository: AuditRepository,
    private readonly emailService: EmailService,
    private readonly redisClient: Redis,
  ) {}

  /**
   * Generates a full personal data archive and emails it as a JSON attachment.
   * Rate limited to once every 24 hours per user.
   */
  async requestExport(userId: string, context: { ipAddress: string | null; userAgent: string | null }): Promise<void> {
    // 0. Enforce 24-hour rate limit via Redis
    const cooldownKey = `data_export:cooldown:${userId}`;
    const ttl = await this.redisClient.ttl(cooldownKey);
    if (ttl > 0) {
      const hours = Math.ceil(ttl / 3600);
      throw ErrorFactory.badRequest(
        `You can only request a data export once every 24 hours. Please try again in ${hours} hour${hours > 1 ? 's' : ''}.`,
      );
    }
    // 1. Fetch user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw ErrorFactory.notFound('User not found');
    }

    // 2. Fetch credential metadata (no hash)
    const credential = await this.userRepository.getCredentialsByUserId(userId);

    // 3. Fetch active sessions
    const sessions = await this.sessionRepository.findActiveSessionsByUserId(userId);

    // 4. Fetch MFA status (no secret)
    let mfaStatus: { mfaEnabled: boolean } = { mfaEnabled: false };
    try {
      const mfaRecord = await this.mfaRepository.findByUserId(userId);
      mfaStatus = { mfaEnabled: mfaRecord?.totpEnabled ?? false };
    } catch {
      // Non-fatal: MFA data may not exist
    }

    // 5. Fetch connected OAuth providers
    let connectedProviders: string[] = [];
    try {
      const providers = await this.oauthRepository.findOAuthAccountsByUserId(userId);
      connectedProviders = providers.map((p) => p.provider).filter(Boolean);
    } catch {
      // Non-fatal
    }

    // 6. Fetch security events (audit log)
    let securityEvents: any[] = [];
    try {
      securityEvents = await this.auditRepository.findSecurityEventsForUser(userId);
    } catch {
      // Non-fatal
    }

    // 7. Assemble sanitized archive (NO passwords, NO secrets, NO token hashes)
    const archive = {
      exportMetadata: {
        generatedAt: new Date().toISOString(),
        requestedBy: user.email,
        format: 'AI Career OS Personal Data Archive v1',
        compliance: 'Digital Personal Data Protection (DPDP) Act, 2023',
      },
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        phone: user.phone,
        university: user.university,
        country: user.country,
        role: user.role,
        position: user.position,
        status: user.status,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        lastLogin: user.lastLogin?.toISOString() ?? null,
      },
      security: {
        mfaEnabled: mfaStatus.mfaEnabled,
        credentialCreatedAt: credential?.createdAt?.toISOString() ?? null,
        credentialLastUpdated: credential?.updatedAt?.toISOString() ?? null,
        // Note: password hash, MFA secret, and token hashes are intentionally excluded
      },
      activeSessions: sessions.map((s) => ({
        id: s.id,
        browser: s.browser,
        os: s.os,
        deviceName: s.deviceName,
        ipAddress: s.ipAddress,
        location: s.location,
        createdAt: s.createdAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        // Note: refreshTokenHash is intentionally excluded
      })),
      connectedProviders,
      securityEventLog: securityEvents.map((e: any) => ({
        eventType: e.eventType,
        ipAddress: e.ipAddress,
        createdAt: e.createdAt,
        details: e.details,
      })),
    };

    // 8. Serialize to JSON (pretty-printed, human-readable)
    const archiveJson = JSON.stringify(archive, null, 2);
    const archiveBuffer = Buffer.from(archiveJson, 'utf-8');

    // 9. Send email with JSON attachment
    const requestedAt = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    await this.emailService.sendEmailWithAttachment({
      to: user.email,
      subject: 'Your AI Career OS Data Export',
      templateName: 'data-export.html',
      variables: {
        username: user.fullName || user.username,
        userEmail: user.email,
        requestedAt,
      },
      attachment: {
        filename: `aicareeros-data-export-${user.id}-${Date.now()}.json`,
        content: archiveBuffer,
        contentType: 'application/json',
      },
    });

    // 10. Record security event for audit trail
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'data_export_requested',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: {
        email: user.email,
        recordsIncluded: {
          sessions: sessions.length,
          providers: connectedProviders.length,
          securityEvents: securityEvents.length,
        },
      },
    });

    // 11. Set 24-hour rate limit lock in Redis
    await this.redisClient.set(cooldownKey, '1', 'EX', this.EXPORT_COOLDOWN_SECONDS);
  }
}
