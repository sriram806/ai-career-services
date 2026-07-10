import * as crypto from 'node:crypto';
import type { PasswordResetRepository } from '../repositories/password-reset.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { SessionRepository } from '../repositories/session.repository';
import type { PasswordHistoryRepository } from '../repositories/password-history.repository';
import type { AuditRepository } from '../repositories/audit.repository';
import type { PasswordService } from './password.service';
import type { Redis } from 'ioredis';
import { ErrorFactory } from '@ai-career-os/errors';
import type { EmailService } from './email.service';

/**
 * Password Reset Service.
 *
 * Implements the "Forgot Password" → "Reset Password" flow with:
 *   - Cryptographically secure random tokens (48 bytes / 384 bits entropy)
 *   - SHA-256 hashed storage (plaintext never persisted)
 *   - 15-minute expiry (OWASP ASVS §2.1.6)
 *   - Single-use tokens
 *   - Rate limiting via Redis cooldown
 *   - All active sessions invalidated on successful reset
 *   - Password history check (previous 5 passwords cannot be reused)
 *
 * Why tokens instead of OTP for password reset:
 *   Tokens provide 384 bits of entropy vs 20 bits for a 6-digit OTP.
 *   For password reset — a high-value security operation — we need the
 *   strongest possible protection against brute-force.
 *
 * Redis key schema:
 *   pwd:reset:cooldown:{email}  → request cooldown lock (TTL: 60 sec)
 *   pwd:reset:daily:{email}     → daily request counter (TTL: 24 hours)
 */
export class PasswordResetService {
  private readonly tokenExpiryMinutes = 15;
  private readonly cooldownSeconds = 60;
  private readonly maxDailyRequests = 5;
  private readonly passwordHistoryLimit = 5;

  constructor(
    private readonly passwordResetRepository: PasswordResetRepository,
    private readonly userRepository: UserRepository,
    private readonly sessionRepository: SessionRepository,
    private readonly passwordHistoryRepository: PasswordHistoryRepository,
    private readonly auditRepository: AuditRepository,
    private readonly passwordService: PasswordService,
    private readonly redisClient: Redis,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generates a password reset token for the given email.
   *
   * Returns the plaintext token (to be sent via email), or null if the email
   * doesn't match an account (to prevent user enumeration).
   *
   * Rate limiting:
   *   - 60-second cooldown between requests per email
   *   - Max 5 requests per 24 hours per email
   */
  async generateResetToken(
    email: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<string | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const cooldownKey = `pwd:reset:cooldown:${normalizedEmail}`;
    const dailyKey = `pwd:reset:daily:${normalizedEmail}`;

    // 1. Rate limiting — cooldown
    const onCooldown = await this.redisClient.exists(cooldownKey);
    if (onCooldown) {
      // Return null silently — don't reveal rate limit to prevent enumeration
      return null;
    }

    // 2. Rate limiting — daily cap
    const dailyCount = Number(await this.redisClient.get(dailyKey) ?? 0);
    if (dailyCount >= this.maxDailyRequests) {
      return null;
    }

    // 3. Look up user
    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      // Execute a dummy hash to prevent timing attacks that reveal user existence
      await this.passwordService.hashPassword('dummy_timing_equalization_value');
      return null;
    }

    // 4. Invalidate all existing reset tokens for this user
    await this.passwordResetRepository.invalidateAllForUser(user.id);

    // 5. Generate token
    const plainToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + this.tokenExpiryMinutes * 60_000);

    await this.passwordResetRepository.createToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // Send email reset link asynchronously
    this.emailService.sendPasswordResetEmail(normalizedEmail, plainToken).catch((err) => {
      console.error(`Failed to send password reset email to ${normalizedEmail}:`, err);
    });

    // 6. Set rate limit state
    await this.redisClient.set(cooldownKey, '1', 'EX', this.cooldownSeconds);
    const newDailyCount = await this.redisClient.incr(dailyKey);
    if (newDailyCount === 1) {
      await this.redisClient.expire(dailyKey, 86400);
    }

    // 7. Audit log
    await this.auditRepository.createSecurityEvent({
      userId: user.id,
      eventType: 'user.password_reset.requested',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: {},
    });

    return plainToken;
  }

  /**
   * Validates the reset token and updates the user's password.
   *
   * On success:
   *   - Password is updated
   *   - Token is marked as used (single-use)
   *   - All active sessions are revoked (force re-login everywhere)
   *   - Old password hash is added to password history
   *   - Audit event is recorded
   *
   * On failure:
   *   - Generic error is returned (no token existence leak)
   */
  async resetPassword(
    token: string,
    newPassword: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 1. Look up token
    const tokenRecord = await this.passwordResetRepository.findByTokenHash(tokenHash);
    if (!tokenRecord) {
      throw ErrorFactory.badRequest('Invalid or expired password reset token');
    }

    // 2. Single-use check
    if (tokenRecord.usedAt) {
      throw ErrorFactory.badRequest('This password reset token has already been used');
    }

    // 3. Expiry check
    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      throw ErrorFactory.badRequest('Password reset token has expired. Please request a new one.');
    }

    // 4. Load user
    const user = await this.userRepository.findById(tokenRecord.userId);
    if (!user) {
      throw ErrorFactory.badRequest('Invalid request');
    }

    // 5. Validate new password policy
    const policy = this.passwordService.validatePasswordPolicy(newPassword, {
      username: user.username,
      email: user.email,
    });
    if (!policy.isValid) {
      throw ErrorFactory.badRequest(policy.reason || 'Password does not meet requirements');
    }

    // 6. Check password history (previous 5 passwords cannot be reused)
    const previousHashes = await this.passwordHistoryRepository.getRecentHashes(
      user.id,
      this.passwordHistoryLimit,
    );
    const isReuse = await this.passwordService.isPasswordInHistory(newPassword, previousHashes);
    if (isReuse) {
      throw ErrorFactory.badRequest(
        'New password cannot be the same as any of your previous 5 passwords',
      );
    }

    // 7. Save old password hash to history before updating
    const currentCredentials = await this.userRepository.getCredentialsByUserId(user.id);
    if (currentCredentials) {
      await this.passwordHistoryRepository.addEntry(user.id, currentCredentials.passwordHash);
    }

    // 8. Update password
    const newHash = await this.passwordService.hashPassword(newPassword);
    await this.userRepository.updatePassword(user.id, newHash);

    // 9. Mark token as used
    await this.passwordResetRepository.markUsed(tokenRecord.id);

    // 10. Revoke all active sessions (force re-login everywhere)
    await this.sessionRepository.revokeAllUserSessions(user.id);

    // 11. Clear any account lockout (password reset is also a recovery mechanism)
    await this.userRepository.clearFailedAttempts(user.id);

    // 12. Audit log
    await this.auditRepository.createSecurityEvent({
      userId: user.id,
      eventType: 'user.password.reset',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: { sessionsRevoked: true },
    });
  }
}
