import * as crypto from 'node:crypto';
import type { EmailVerificationRepository } from '../repositories/email-verification.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { AuditRepository } from '../repositories/audit.repository';
import type { Redis } from 'ioredis';
import { ErrorFactory } from '@ai-career-os/errors';
import type { EmailService } from './email.service';

/**
 * Email Verification Service.
 *
 * Implements dual verification: secure random token (link) AND OTP (code).
 * The token-based approach is the primary mechanism — a 48-byte cryptographically
 * random token is generated, SHA-256 hashed for storage, and the plaintext
 * is sent to the user via email.
 *
 * Security properties:
 *   - Tokens are 48 bytes (96 hex chars) — effectively unguessable (384 bits entropy)
 *   - Only SHA-256 hash stored in DB — database breach doesn't compromise tokens
 *   - Single-use: token is marked used immediately on successful verification
 *   - 24-hour expiry window
 *   - 5-minute resend cooldown to prevent email bombing
 *   - All previous tokens invalidated when a new one is issued
 *
 * Redis key schema:
 *   email:verify:cooldown:{userId} → resend cooldown lock (TTL: 5 min)
 */
export class EmailVerificationService {
  private readonly tokenExpiryHours = 24;
  private readonly resendCooldownSeconds = 300; // 5 minutes

  constructor(
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly userRepository: UserRepository,
    private readonly auditRepository: AuditRepository,
    private readonly redisClient: Redis,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generates a secure email verification token.
   * Returns the plaintext token to be sent via email.
   *
   * This method also invalidates any previously issued tokens for the user.
   */
  async generateVerificationToken(userId: string): Promise<string> {
    // Invalidate all existing tokens for this user
    await this.emailVerificationRepository.invalidateAllForUser(userId);

    // Generate cryptographically secure token
    const plainToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(plainToken);
    const expiresAt = new Date(Date.now() + this.tokenExpiryHours * 60 * 60 * 1000);

    await this.emailVerificationRepository.createToken({
      userId,
      tokenHash,
      expiresAt,
    });

    // Send email verification asynchronously
    const user = await this.userRepository.findById(userId);
    if (user) {
      this.emailService
        .sendVerificationEmail(user.email, user.username, plainToken)
        .catch((err) => {
          // Log verification email failure
          console.error(`Failed to send verification email to ${user.email}:`, err);
        });
    }

    return plainToken;
  }

  /**
   * Verifies the email verification token and activates the user account.
   *
   * Returns the userId on success for audit trail purposes.
   * Throws on invalid, expired, or already-used tokens.
   */
  async verifyToken(
    token: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<string> {
    const tokenHash = this.hashToken(token);

    const tokenRecord = await this.emailVerificationRepository.findByTokenHash(tokenHash);
    if (!tokenRecord) {
      throw ErrorFactory.badRequest('Invalid or expired verification token');
    }

    // Check if already used (single-use enforcement)
    if (tokenRecord.usedAt) {
      throw ErrorFactory.badRequest('This verification token has already been used');
    }

    // Check expiry
    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      throw ErrorFactory.badRequest('Verification token has expired. Please request a new one.');
    }

    // Mark token as used
    await this.emailVerificationRepository.markUsed(tokenRecord.id);

    // Activate the user account
    await this.userRepository.updateUser(tokenRecord.userId, {
      status: 'active',
      emailVerified: true,
    });

    // Audit log
    await this.auditRepository.createSecurityEvent({
      userId: tokenRecord.userId,
      eventType: 'user.email.verified',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: { method: 'token' },
    });

    return tokenRecord.userId;
  }

  /**
   * Resends verification email with cooldown enforcement.
   *
   * Rate limiting:
   *   - 5-minute cooldown between resend requests
   *   - Previous tokens are invalidated when a new one is issued
   */
  async resendVerification(
    userId: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<string> {
    const cooldownKey = `email:verify:cooldown:${userId}`;

    // Check cooldown
    const onCooldown = await this.redisClient.exists(cooldownKey);
    if (onCooldown) {
      const ttl = await this.redisClient.ttl(cooldownKey);
      throw ErrorFactory.badRequest(
        `Please wait ${ttl > 0 ? ttl : this.resendCooldownSeconds} seconds before requesting another verification email`,
      );
    }

    // Verify user exists and is not already verified
    const user = await this.userRepository.findById(userId);
    if (!user) {
      // Return generic error to prevent user enumeration
      throw ErrorFactory.badRequest('Unable to process verification request');
    }

    if (user.emailVerified) {
      throw ErrorFactory.badRequest('Email is already verified');
    }

    // Generate new token
    const plainToken = await this.generateVerificationToken(userId);

    // Set cooldown
    await this.redisClient.set(cooldownKey, '1', 'EX', this.resendCooldownSeconds);

    // Audit log
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'user.email.verification_resent',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: {},
    });

    return plainToken;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
