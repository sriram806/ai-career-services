import * as crypto from 'node:crypto';
import type { MfaRepository, DbMfaSettings } from '../repositories/mfa.repository';
import type { AuditRepository } from '../repositories/audit.repository';
import type { OtpService } from './otp.service';
import type { Redis } from 'ioredis';
import { Totp } from '../utils/totp';
import { ErrorFactory } from '@ai-career-os/errors';

export class MfaService {
  private readonly SETUP_TTL = 300; // 5 minutes

  constructor(
    private readonly mfaRepository: MfaRepository,
    private readonly auditRepository: AuditRepository,
    private readonly otpService: OtpService,
    private readonly redisClient: Redis,
  ) {}

  async getSettings(userId: string): Promise<DbMfaSettings | null> {
    return this.mfaRepository.findByUserId(userId);
  }

  /**
   * Begins the TOTP MFA setup flow by generating a secret and QR code URI.
   * Stores secret temporarily in Redis.
   */
  async initiateTotpSetup(userId: string, email: string): Promise<{ secret: string; qrCodeUri: string }> {
    const secret = Totp.generateSecret();
    const qrCodeUri = Totp.getQrCodeUri(secret, email);

    // Save temporary secret in Redis
    await this.redisClient.set(`mfa:setup:totp:${userId}`, secret, 'EX', this.SETUP_TTL);

    return { secret, qrCodeUri };
  }

  /**
   * Verifies the setup code. If correct, enables TOTP, generates and hashes 10 recovery codes,
   * saves them to the DB, and returns the plaintext codes to the user.
   */
  async verifyAndEnableTotp(userId: string, code: string, ctx: { ipAddress: string | null; userAgent: string | null }): Promise<string[]> {
    const secret = await this.redisClient.get(`mfa:setup:totp:${userId}`);
    if (!secret) {
      throw ErrorFactory.badRequest('MFA setup session expired. Please initiate setup again.');
    }

    const isValid = Totp.verifyToken(secret, code);
    if (!isValid) {
      throw ErrorFactory.badRequest('Invalid verification code');
    }

    // 1. Save settings
    await this.mfaRepository.upsertSettings({
      userId,
      totpEnabled: true,
      totpSecret: secret,
    });

    // 2. Generate 10 recovery codes
    const recoveryCodes = this.generatePlaintextRecoveryCodes();
    const hashes = recoveryCodes.map((c) => this.hashRecoveryCode(c));
    await this.mfaRepository.saveRecoveryCodes(userId, hashes);

    // 3. Cleanup Redis setup
    await this.redisClient.del(`mfa:setup:totp:${userId}`);

    // 4. Audit
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'mfa.enabled',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: { type: 'totp' },
    });

    return recoveryCodes;
  }

  /**
   * Enables Email MFA.
   */
  async enableEmailMfa(userId: string, ctx: { ipAddress: string | null; userAgent: string | null }): Promise<string[]> {
    await this.mfaRepository.upsertSettings({
      userId,
      emailEnabled: true,
    });

    const recoveryCodes = this.generatePlaintextRecoveryCodes();
    const hashes = recoveryCodes.map((c) => this.hashRecoveryCode(c));
    await this.mfaRepository.saveRecoveryCodes(userId, hashes);

    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'mfa.enabled',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: { type: 'email' },
    });

    return recoveryCodes;
  }

  /**
   * Disables MFA for user. Requires code verification.
   */
  async disableMfa(
    userId: string,
    code: string,
    ctx: { ipAddress: string | null; userAgent: string | null },
  ): Promise<void> {
    const settings = await this.mfaRepository.findByUserId(userId);
    if (!settings || (!settings.totpEnabled && !settings.emailEnabled)) {
      throw ErrorFactory.badRequest('MFA is not enabled on this account');
    }

    // Verify token or recovery code
    const verified = await this.verifyMfaToken(userId, code);
    if (!verified) {
      throw ErrorFactory.badRequest('Invalid verification or recovery code');
    }

    // Disable all
    await this.mfaRepository.upsertSettings({
      userId,
      totpEnabled: false,
      totpSecret: null,
      emailEnabled: false,
      smsEnabled: false,
    });

    // Revoke recovery codes
    await this.mfaRepository.deleteRecoveryCodes(userId);

    // Audit
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'mfa.disabled',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: {},
    });
  }

  /**
   * Verifies the code during login or a sensitive operation.
   * Can be a TOTP token, an Email OTP code, or a recovery code.
   */
  async verifyMfaToken(userId: string, code: string): Promise<boolean> {
    const settings = await this.mfaRepository.findByUserId(userId);
    if (!settings) return false;

    // 1. Try TOTP if enabled
    if (settings.totpEnabled && settings.totpSecret) {
      const isTotpValid = Totp.verifyToken(settings.totpSecret, code);
      if (isTotpValid) return true;
    }

    // 2. Try Email OTP if enabled
    if (settings.emailEnabled) {
      try {
        const isEmailOtpValid = await this.otpService.verifyOtp(userId, 'mfa', code);
        if (isEmailOtpValid) return true;
      } catch {
        // Fall through to recovery code check
      }
    }

    // 3. Try Recovery Code check
    const recoveryCodesList = await this.mfaRepository.findRecoveryCodesByUserId(userId);
    const codeHash = this.hashRecoveryCode(code);

    const activeCode = recoveryCodesList.find(
      (rc) => !rc.isUsed && rc.codeHash === codeHash,
    );

    if (activeCode) {
      // Mark as used
      await this.mfaRepository.markRecoveryCodeUsed(activeCode.id);
      
      // Audit
      await this.auditRepository.createSecurityEvent({
        userId,
        eventType: 'mfa.recovery_code.used',
        details: { codeId: activeCode.id },
      });
      
      return true;
    }

    return false;
  }

  /**
   * Triggers rotation of recovery codes. Requires verification of a code.
   */
  async rotateRecoveryCodes(
    userId: string,
    code: string,
    ctx: { ipAddress: string | null; userAgent: string | null },
  ): Promise<string[]> {
    const verified = await this.verifyMfaToken(userId, code);
    if (!verified) {
      throw ErrorFactory.badRequest('Invalid verification or recovery code');
    }

    const recoveryCodes = this.generatePlaintextRecoveryCodes();
    const hashes = recoveryCodes.map((c) => this.hashRecoveryCode(c));
    await this.mfaRepository.saveRecoveryCodes(userId, hashes);

    // Audit
    await this.auditRepository.createSecurityEvent({
      userId,
      eventType: 'mfa.recovery_codes.rotated',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      details: {},
    });

    return recoveryCodes;
  }

  private generatePlaintextRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      // Generate 12-char random alphanumeric code formatted as XXXX-XXXX-XXXX
      const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
      const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
      codes.push(formatted);
    }
    return codes;
  }

  private hashRecoveryCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }
}
