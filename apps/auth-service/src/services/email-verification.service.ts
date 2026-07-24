import type { UserRepository } from '../repositories/user.repository';
import type { AuditRepository } from '../repositories/audit.repository';
import { ErrorFactory } from '@ai-career-os/errors';
import type { OtpService } from './otp.service';

/**
 * Email Verification Service.
 *
 * Implements OTP code-based verification flow.
 */
export class EmailVerificationService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly auditRepository: AuditRepository,
    private readonly otpService: OtpService,
  ) {}

  /**
   * Generates a secure email verification OTP.
   * Returns the plaintext OTP to be sent via email.
   */
  async generateVerificationToken(userId: string): Promise<string> {
    const code = await this.otpService.generateOtp(userId, 'email_verification');
    return code;
  }

  /**
   * Verifies the email verification OTP code and activates the user account.
   *
   * Returns the userId on success for audit trail purposes.
   * Throws on invalid, expired, or already-used OTP codes.
   */
  async verifyOtp(
    email: string,
    code: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<string> {
    const user = await this.userRepository.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw ErrorFactory.badRequest('Invalid verification code or email');
    }

    if (user.emailVerified) {
      throw ErrorFactory.badRequest('Email is already verified');
    }

    // Verify OTP using otpService
    const isValid = await this.otpService.verifyOtp(user.id, 'email_verification', code);
    if (!isValid) {
      throw ErrorFactory.badRequest('Invalid verification code');
    }

    // Activate the user account
    await this.userRepository.updateUser(user.id, {
      status: 'active',
      emailVerified: true,
    });

    // Audit log
    await this.auditRepository.createSecurityEvent({
      userId: user.id,
      eventType: 'user.email.verified',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: { method: 'otp' },
    });

    return user.id;
  }

  /**
   * Resends verification OTP with cooldown enforcement.
   */
  async resendVerification(
    userId: string,
    context: { ipAddress: string | null; userAgent: string | null },
  ): Promise<string> {
    // Verify user exists and is not already verified
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw ErrorFactory.badRequest('Unable to process verification request');
    }

    if (user.emailVerified) {
      throw ErrorFactory.badRequest('Email is already verified');
    }

    // Generate new OTP
    const code = await this.generateVerificationToken(userId);

    // Audit log
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'user.email.verification_resent',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      details: { method: 'otp' },
    });

    return code;
  }
}
